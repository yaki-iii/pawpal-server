import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { llmClient } from './llmClient';
import { SearchService } from './searchService';
import { WebSearchService, type WebSearchResult } from './webSearchService';
import type { AIAssistantSessionDTO, AISource } from '../types';
import type { AIAssistantSession } from '@prisma/client';

/**
 * System prompt for the AI assistant.
 * CRITICAL: This prompt is hardcoded in the backend and cannot be modified by the frontend.
 * The AI must NOT provide medical diagnosis or medication dosages.
 *
 * Updated for multi-source search: the AI now receives context from community posts
 * and web search results (including Xiaohongshu and Douyin content).
 */
const SYSTEM_PROMPT = `你是 PawPal 爪友的宠物经验总结助手，提供类似"腾讯元宝"的搜索总结体验。你的职责是：

1. 根据用户的问题，综合社区帖子和网络搜索结果（包括小红书、抖音等平台内容），给出总结性回答
2. 回答要分条列出要点，语言简洁明了，通俗易懂
3. 引用信息时标注来源，如"据社区宠主分享"、"据小红书经验"、"据抖音视频"等
4. 不要编造没有搜索结果支撑的信息，如果搜索结果不足，坦诚说明
5. 不提供医疗诊断，不给出具体用药剂量
6. 不替代兽医的专业建议
7. 如果问题涉及紧急情况（如大量出血、呼吸困难、严重外伤），建议用户立即就医

请始终记住：你是经验总结助手，不是兽医。所有建议仅供参考。`;

/**
 * Question type categories for classification.
 */
const QUESTION_CATEGORIES = [
  '消化问题', '皮肤问题', '行为异常', '眼部问题', '耳部问题',
  '口腔问题', '呼吸道问题', '泌尿问题', '骨科问题', '营养饮食', '其他',
];

/**
 * Fixed disclaimer text — appended to every AI response.
 */
const DISCLAIMER = '以上内容来自社区、知识库和网络公开信息总结，仅供参考，不构成专业兽医建议，复杂情况请及时就医。';

/**
 * AIService — orchestrates the multi-source AI consultation pipeline:
 * 1. Identify question type (LLM classification)
 * 2. Search content from multiple sources in parallel:
 *    a. Community posts (站内社区)
 *    b. Web search via DuckDuckGo (网络, including 小红书/抖音 content)
 * 3. Summarize (LLM summarization with multi-source context)
 * 4. Assemble result + sources + disclaimer
 *
 * Degradation strategy:
 * - If web search fails, falls back to community + LLM only.
 * - If LLM fails, falls back to a structured summary from search results.
 * - If all search fails, LLM answers based on its own knowledge.
 */
export class AIService {
  /**
   * Run the full multi-source AI consultation pipeline.
   * @throws Error if pipeline fails at any step.
   */
  static async runPipeline(data: {
    userId: string;
    question: string;
    petId?: string;
    imageUrls?: string[];
  }): Promise<AIAssistantSessionDTO> {
    const { userId, question, petId, imageUrls = [] } = data;
    logger.info(`AI pipeline started for user ${userId}, question: ${question.substring(0, 50)}...`);

    // Step 1: Identify question type
    let questionType = '其他';
    if (llmClient.isConfigured()) {
      try {
        questionType = await llmClient.classify(question, QUESTION_CATEGORIES);
        logger.info(`AI question type: ${questionType}`);
      } catch (error) {
        logger.warn(`Question type classification failed, using default: ${(error as Error).message}`);
      }
    }

    // Step 2: Search content from multiple sources in parallel
    // - Community posts (站内搜索)
    // - Web search via DuckDuckGo (网络搜索, including 小红书/抖音)
    const searchKeyword = `${question} ${questionType}`;

    const [searchResults, webResults] = await Promise.all([
      SearchService.searchAll(searchKeyword, 5).catch((error) => {
        logger.warn(`Site search failed, continuing with web only: ${(error as Error).message}`);
        return { posts: [] };
      }),
      WebSearchService.search(question, 5).catch((error) => {
        logger.warn(`Web search failed, continuing with site only: ${(error as Error).message}`);
        return [] as WebSearchResult[];
      }),
    ]);

    logger.info(
      `AI search results: ${searchResults.posts.length} posts, ${webResults.length} web results`,
    );

    // Build sources array for the response
    const sources: AISource[] = [
      ...searchResults.posts.map((post) => ({
        type: 'post' as const,
        title: post.title,
        url: `/posts/${post.id}`,
        snippet: post.content.substring(0, 100),
      })),
      ...webResults.map((web) => ({
        type: 'web' as const,
        title: web.title,
        url: web.url,
        snippet: web.snippet,
      })),
    ];

    // Step 3: Summarize (LLM summarization with multi-source context)
    let summary = '';
    if (llmClient.isConfigured()) {
      try {
        const contextText = AIService.buildContextText(
          question,
          searchResults.posts,
          webResults,
        );
        const messages: Array<{ role: 'system' | 'user'; content: string }> = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contextText },
        ];
        summary = await llmClient.chat(messages, { temperature: 0.7, maxTokens: 1000 });
        logger.info('AI summary generated successfully');
      } catch (error) {
        logger.warn(`AI summary failed, using fallback: ${(error as Error).message}`);
        summary = AIService.buildFallbackSummary(searchResults.posts, webResults);
      }
    } else {
      // LLM not configured — use fallback summary from search results
      summary = AIService.buildFallbackSummary(searchResults.posts, webResults);
    }

    // Step 4: Assemble result + disclaimer
    const session = await prisma.aIAssistantSession.create({
      data: {
        userId,
        petId: petId || null,
        question,
        imageUrls,
        questionType,
        summary: summary + '\n\n⚠️ ' + DISCLAIMER,
        sources: sources as unknown as Record<string, unknown>[],
        conversationId: null, // legacy one-shot, no conversation
        role: 'user',
      },
    });

    logger.info(`AI pipeline completed: session ${session.id}`);
    return AIService.toDTO(session);
  }

  /**
   * Build context text for the LLM from all search sources.
   * Includes community posts and web search results.
   */
  static buildContextText(
    question: string,
    posts: Array<{ title: string; content: string }>,
    webResults: WebSearchResult[],
  ): string {
    let context = `用户问题：${question}\n\n`;

    if (posts.length > 0) {
      context += '【社区帖子】\n';
      posts.forEach((post, i) => {
        context += `${i + 1}. ${post.title}\n${post.content.substring(0, 200)}\n\n`;
      });
    }

    if (webResults.length > 0) {
      context += '【网络搜索结果】（包含小红书、抖音等平台内容）\n';
      webResults.forEach((web, i) => {
        context += `${i + 1}. [${web.source}] ${web.title}\n${web.snippet}\n来源：${web.url}\n\n`;
      });
    }

    context += '请根据以上信息，综合总结参考建议。要求：\n';
    context += '1. 分条列出要点，语言简洁明了\n';
    context += '2. 引用信息时标注来源（如"据社区帖子"、"据小红书分享"、"据抖音视频"等）\n';
    context += '3. 不要编造没有搜索结果支撑的信息\n';
    context += '4. 不要做医疗诊断，不要给出用药剂量\n';
    context += '5. 如果涉及紧急情况，建议立即就医\n';
    return context;
  }

  /**
   * Build fallback summary when LLM is unavailable.
   * Returns a formatted summary of all search results.
   */
  static buildFallbackSummary(
    posts: Array<{ title: string; content: string }>,
    webResults: WebSearchResult[],
  ): string {
    let summary = '根据社区和网络搜索结果，为您整理以下参考信息：\n\n';

    if (posts.length > 0) {
      summary += '📋 社区相关讨论：\n';
      posts.forEach((post, i) => {
        summary += `${i + 1}. ${post.title}\n`;
      });
      summary += '\n';
    }

    if (webResults.length > 0) {
      summary += '🌐 网络相关内容：\n';
      webResults.forEach((web, i) => {
        summary += `${i + 1}. [${web.source}] ${web.title}\n`;
      });
      summary += '\n';
    }

    if (posts.length === 0 && webResults.length === 0) {
      summary += '暂未找到与您问题直接相关的内容。建议您在社区发布求助帖，获取更多宠主的经验分享。\n';
    }

    return summary;
  }

  /**
   * Build the fixed disclaimer text.
   */
  static buildDisclaimer(): string {
    return DISCLAIMER;
  }

  /**
   * Get the system prompt (used by ChatService).
   */
  static getSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  /**
   * List all AI sessions for a user.
   */
  static async listByUser(userId: string): Promise<AIAssistantSessionDTO[]> {
    const sessions = await prisma.aIAssistantSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map(AIService.toDTO);
  }

  /**
   * Get a single AI session by ID.
   */
  static async getById(id: string, userId: string): Promise<AIAssistantSessionDTO> {
    const session = await prisma.aIAssistantSession.findUnique({ where: { id } });
    if (!session) {
      throw new Error('咨询记录不存在');
    }
    if (session.userId !== userId) {
      throw new Error('无权访问该记录');
    }
    return AIService.toDTO(session);
  }

  /**
   * Update the status of an AI session.
   */
  static async updateStatus(id: string, userId: string, status: string): Promise<AIAssistantSessionDTO> {
    const existing = await prisma.aIAssistantSession.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('咨询记录不存在');
    }
    if (existing.userId !== userId) {
      throw new Error('无权修改该记录');
    }

    const session = await prisma.aIAssistantSession.update({
      where: { id },
      data: { status: status as 'OBSERVING' | 'RECOVERED' | 'VISITED_DOCTOR' },
    });

    return AIService.toDTO(session);
  }

  /**
   * Convert a Prisma AIAssistantSession to a DTO.
   */
  static toDTO(session: AIAssistantSession): AIAssistantSessionDTO {
    const sources = session.sources as unknown[];
    return {
      id: session.id,
      userId: session.userId,
      petId: session.petId,
      question: session.question,
      imageUrls: session.imageUrls,
      questionType: session.questionType,
      summary: session.summary,
      sources,
      resultCard: AIService.resultCardFromSources(sources),
      status: session.status,
      conversationId: (session as { conversationId?: string | null }).conversationId ?? null,
      role: (session as { role?: string }).role ?? 'user',
      parentId: (session as { parentId?: string | null }).parentId ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private static resultCardFromSources(sources: unknown[]): AIAssistantSessionDTO['resultCard'] {
    const entry = sources.find((source) => {
      return typeof source === 'object'
        && source !== null
        && (source as { type?: unknown }).type === 'resultCard';
    });
    if (!entry || typeof entry !== 'object') return undefined;
    return (entry as { card?: AIAssistantSessionDTO['resultCard'] }).card;
  }
}
