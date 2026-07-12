import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { llmClient } from './llmClient';
import { arkVisionClient } from './arkVisionClient';
import { AIService } from './aiService';
import { AIMonitoringService } from './aiMonitoringService';
import { config } from '../config';
import type { AIAssistantSessionDTO, AIResultCardDTO } from '../types';
import type { AIAssistantSession } from '@prisma/client';
import { randomUUID } from 'crypto';

/**
 * ConversationSummary — a lightweight conversation list item.
 */
export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  lastMessageAt: string;
  messageCount: number;
}

/**
 * ChatService — multi-turn AI chat with conversation history.
 *
 * Storage model:
 *  - Each turn is stored as a separate AIAssistantSession row
 *  - All turns of one conversation share the same `conversationId`
 *  - Each new message records `role` (user/assistant) and `parentId`
 *    (the previous message in the chain) for branching support
 *
 * Pipeline:
 *  1. If no conversationId provided, generate a new one
 *  2. Fetch conversation history (ordered by createdAt)
 *  3. Build the OpenAI-style messages array: [system, ...history, user]
 *  4. Call LLM and store both the user message and the assistant reply
 *  5. Return the assistant reply as the response
 */
export class ChatService {
  /**
   * Send a message in a (possibly existing) conversation.
   * If conversationId is null/undefined, a new conversation is started.
   * Returns the assistant's reply as a DTO.
   */
  static async chat(data: {
    userId: string;
    message: string;
    conversationId?: string;
    petId?: string;
    imageUrls?: string[];
  }): Promise<AIAssistantSessionDTO> {
    const { userId, message } = data;
    const imageUrls = data.imageUrls || [];
    const conversationId = data.conversationId || randomUUID();

    logger.info(
      `Chat: user=${userId} conversation=${conversationId} msg="${message.substring(0, 50)}..."`,
    );

    // Save the user message first
    const userMessage = await prisma.aIAssistantSession.create({
      data: {
        userId,
        petId: data.petId || null,
        question: message,
        imageUrls,
        questionType: '',
        summary: '',
        sources: [],
        conversationId,
        role: 'user',
        parentId: null, // Will be linked below if there's prior history
      },
    });

    // Fetch the conversation history (all prior messages — both user + assistant)
    const history = await prisma.aIAssistantSession.findMany({
      where: { conversationId, id: { not: userMessage.id } },
      orderBy: { createdAt: 'asc' },
    });

    // Link the new user message to the last prior message (chain)
    if (history.length > 0) {
      const lastMessage = history[history.length - 1];
      await prisma.aIAssistantSession.update({
        where: { id: userMessage.id },
        data: { parentId: lastMessage.id },
      });
    }

    // Build the OpenAI-style messages array
    const systemPrompt = AIService.getSystemPrompt();
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];
    for (const m of history) {
      const role = (m as { role?: string }).role === 'assistant' ? 'assistant' : 'user';
      const content = role === 'assistant' ? m.summary : m.question;
      messages.push({ role, content });
    }
    messages.push({ role: 'user', content: ChatService.buildUserPrompt(message, imageUrls) });

    // Call Ark vision for image-assisted chat when configured, otherwise fall back
    // to the existing text LLM path with an explicit image limitation notice.
    let assistantReply = '';
    let usedVisionModel = false;
    if (imageUrls.length > 0 && arkVisionClient.isConfigured()) {
      try {
        assistantReply = await arkVisionClient.analyzeImages({
          systemPrompt,
          history,
          message,
          imageUrls,
        });
        void AIMonitoringService.recordCall({
          userId,
          conversationId,
          provider: 'ARK_VISION',
          model: config.ark.visionModel,
          operation: 'CHAT_VISION',
          status: 'SUCCESS',
          imageCount: imageUrls.length,
        });
        usedVisionModel = true;
        logger.info(`Chat: Ark vision reply generated for conversation=${conversationId}`);
      } catch (error) {
        void AIMonitoringService.recordCall({
          userId,
          conversationId,
          provider: 'ARK_VISION',
          model: config.ark.visionModel,
          operation: 'CHAT_VISION',
          status: 'FAILED',
          imageCount: imageUrls.length,
          errorMessage: (error as Error).message,
        });
        logger.warn(`Chat: Ark vision failed, falling back: ${(error as Error).message}`);
      }
    }

    if (!assistantReply && llmClient.isConfigured()) {
      try {
        assistantReply = await llmClient.chat(messages, {
          temperature: 0.7,
          maxTokens: 1000,
        });
        void AIMonitoringService.recordCall({
          userId,
          conversationId,
          provider: 'DEEPSEEK_TEXT',
          model: config.llm.model,
          operation: 'CHAT_TEXT',
          status: 'SUCCESS',
          imageCount: imageUrls.length,
        });
        logger.info(`Chat: assistant reply generated for conversation=${conversationId}`);
      } catch (error) {
        void AIMonitoringService.recordCall({
          userId,
          conversationId,
          provider: 'DEEPSEEK_TEXT',
          model: config.llm.model,
          operation: 'CHAT_TEXT',
          status: 'FAILED',
          imageCount: imageUrls.length,
          errorMessage: (error as Error).message,
        });
        logger.warn(`Chat: LLM call failed, using fallback: ${(error as Error).message}`);
        assistantReply = ChatService.buildFallbackReply(message, imageUrls.length);
        void AIMonitoringService.recordCall({
          userId,
          conversationId,
          provider: 'FALLBACK',
          operation: 'CHAT_FALLBACK_REPLY',
          status: 'FALLBACK',
          imageCount: imageUrls.length,
          errorMessage: (error as Error).message,
        });
      }
    } else {
      if (!assistantReply) {
        assistantReply = ChatService.buildFallbackReply(message, imageUrls.length);
        void AIMonitoringService.recordCall({
          userId,
          conversationId,
          provider: 'FALLBACK',
          operation: 'CHAT_FALLBACK_REPLY',
          status: 'FALLBACK',
          imageCount: imageUrls.length,
          errorMessage: 'LLM not configured',
        });
      }
    }
    assistantReply = ChatService.normalizeAssistantReply(
      usedVisionModel
        ? assistantReply
        : ChatService.ensureImageLimitationNotice(assistantReply, imageUrls.length),
    );

    const resultCard = ChatService.buildResultCard(message, assistantReply, imageUrls);
    const assistantSources = resultCard ? [{ type: 'resultCard', card: resultCard }] : [];

    // Save the assistant reply as a new message in the conversation
    const assistantMessage = await prisma.aIAssistantSession.create({
      data: {
        userId,
        petId: data.petId || null,
        question: message, // Original user question for context
        imageUrls,
        questionType: '',
        summary: assistantReply,
        sources: assistantSources,
        conversationId,
        role: 'assistant',
        parentId: userMessage.id,
      },
    });

    return AIService.toDTO(assistantMessage);
  }

  /**
   * List all conversations for a user, newest first.
   * Each conversation is summarized by its most recent message.
   */
  static async listConversations(userId: string): Promise<ConversationSummary[]> {
    // Get all messages grouped by conversationId
    const messages = await prisma.aIAssistantSession.findMany({
      where: { userId, conversationId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    const conversationMap = new Map<string, { lastMessage: AIAssistantSession; messages: AIAssistantSession[] }>();
    for (const m of messages) {
      const cid = (m as { conversationId?: string | null }).conversationId;
      if (!cid) continue;
      if (!conversationMap.has(cid)) {
        conversationMap.set(cid, { lastMessage: m, messages: [m] });
      } else {
        conversationMap.get(cid)!.messages.push(m);
      }
    }

    return Array.from(conversationMap.entries())
      .map(([id, group]) => {
        const sortedMessages = [...group.messages].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
        const firstUserMessage = sortedMessages.find(
          (message) => (message as { role?: string }).role !== 'assistant',
        );
        return {
          id,
          title: ChatService.conversationTitle(firstUserMessage?.question || group.lastMessage.question),
          lastMessage:
            (group.lastMessage as { role?: string }).role === 'assistant'
              ? group.lastMessage.summary.substring(0, 100)
              : group.lastMessage.question.substring(0, 100),
          lastMessageAt: group.lastMessage.createdAt.toISOString(),
          messageCount: group.messages.length,
        };
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }

  /**
   * Get all messages in a conversation, ordered chronologically.
   * Verifies the conversation belongs to the user.
   */
  static async getConversationMessages(
    conversationId: string,
    userId: string,
  ): Promise<AIAssistantSessionDTO[]> {
    const messages = await prisma.aIAssistantSession.findMany({
      where: { conversationId, userId },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) {
      throw new Error('对话不存在或无权访问');
    }

    return messages.map(AIService.toDTO);
  }

  /**
   * Delete an entire conversation (all its messages).
   * Verifies the conversation belongs to the user.
   */
  static async deleteConversation(conversationId: string, userId: string): Promise<void> {
    // Verify ownership: any message in the conversation must belong to the user
    const anyMessage = await prisma.aIAssistantSession.findFirst({
      where: { conversationId },
    });
    if (!anyMessage) {
      throw new Error('对话不存在');
    }
    if (anyMessage.userId !== userId) {
      throw new Error('无权删除该对话');
    }

    await prisma.aIAssistantSession.deleteMany({
      where: { conversationId },
    });

    logger.info(`Conversation deleted: ${conversationId} by user ${userId}`);
  }

  /**
   * Build a fallback reply when the LLM is unavailable.
   */
  static buildFallbackReply(userMessage: string, imageCount: number = 0): string {
    const imageFallback =
      imageCount > 0
        ? `\n\n已收到 ${imageCount} 张图片，但图片识别服务暂时不可用。请补充文字描述：部位、颜色/形态变化、持续时间、精神食欲、是否疼痛或出血。`
        : '';

    return (
      `感谢您的提问：「${userMessage.substring(0, 50)}」\n\n` +
      `目前 AI 服务暂时不可用，无法生成详细回复。${imageFallback}\n\n您可以：\n` +
      '1. 在社区发布求助帖获取宠主经验\n' +
      '2. 使用 /api/v1/ai/consult 接口获取搜索增强的回答\n' +
      '3. 如果是紧急情况，请使用 /api/v1/emergency/help 接口\n\n' +
      '⚠️ 以上内容仅供参考，不构成专业诊疗建议，复杂情况请及时联系动物医院。'
    );
  }

  private static ensureImageLimitationNotice(reply: string, imageCount: number): string {
    if (imageCount === 0 || reply.includes('图片识别服务暂时不可用')) {
      return reply;
    }

    return [
      reply,
      '',
      `已收到 ${imageCount} 张图片，但图片识别服务暂时不可用。请补充文字描述：部位、颜色/形态变化、持续时间、精神食欲、是否疼痛或出血。`,
    ].join('\n');
  }

  private static normalizeAssistantReply(reply: string): string {
    return reply
      .replace(/专业兽医建议/g, '专业诊疗建议')
      .replace(/兽医诊所/g, '动物医院')
      .replace(/兽医院/g, '动物医院')
      .replace(/兽医电话/g, '动物医院电话')
      .replace(/咨询兽医/g, '咨询动物医院')
      .replace(/联系兽医/g, '联系动物医院')
      .replace(/专业兽医/g, '专业医生')
      .replace(/不是兽医/g, '不是动物医院医生')
      .replace(/兽医/g, '动物医院');
  }

  private static buildUserPrompt(message: string, imageUrls: string[]): string {
    if (imageUrls.length === 0) {
      return message;
    }

    return [
      message,
      '',
      `用户上传了 ${imageUrls.length} 张图片，请结合这些图片 URL 进行初步观察；如果图片 URL 无法访问，请明确说明需要用户补充文字描述。`,
      ...imageUrls.map((url, index) => `图片 ${index + 1}: ${url}`),
    ].join('\n');
  }

  static buildResultCard(
    userMessage: string,
    assistantReply: string,
    imageUrls: string[] = [],
  ): AIResultCardDTO | undefined {
    const replyText = ChatService.normalizeAssistantReply(assistantReply);
    const lowerReply = replyText.toLowerCase();
    const emergencyKeywords = ['呼吸困难', '大量出血', '抽搐', '中毒', '昏迷', '不能站立', '急诊'];
    const mediumKeywords = ['建议', '观察', '异常', '持续', '联系', '医院', '兽医', '就医'];
    const severity: AIResultCardDTO['severity'] = emergencyKeywords.some((keyword) => lowerReply.includes(keyword))
      ? 'high'
      : mediumKeywords.some((keyword) => lowerReply.includes(keyword))
        ? 'medium'
        : 'low';

    const visualFindings = ChatService.extractLines(replyText, ['图片', '照片', '看到', '显示', '观察']).slice(0, 3);
    const possibleCauses = ChatService.extractLines(replyText, ['可能', '原因', '考虑', '导致']).slice(0, 3);
    const suggestions = ChatService.extractSuggestions(replyText);
    const vetReminder = ChatService.extractLines(replyText, ['就医', '医院', '兽医', '急诊', '医生'])[0] ?? '';
    const shouldSeeVet = Boolean(vetReminder);

    return {
      severity,
      visualFindings,
      possibleCauses,
      suggestions,
      shouldSeeVet,
      vetReminder,
    };
  }

  private static extractSuggestions(reply: string): string[] {
    const cleaned = ChatService.normalizeAssistantReply(reply)
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s*/g, '')
      .split(/\n|。|；|;/)
      .map((line) => line.replace(/^[-•\d.、\s]+/, '').trim())
      .filter((line) => line.length >= 6)
      .filter((line) => !line.includes('仅供参考') && !line.includes('不替代'));

    const priority = cleaned.filter((line) => (
      line.includes('建议')
      || line.includes('观察')
      || line.includes('补充')
      || line.includes('避免')
      || line.includes('联系')
      || line.includes('就医')
    ));
    const picked = (priority.length > 0 ? priority : cleaned).slice(0, 3);

    return picked;
  }

  private static extractLines(reply: string, keywords: string[]): string[] {
    return ChatService.normalizeAssistantReply(reply)
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s*/g, '')
      .split(/\n|。|；|;/)
      .map((line) => line.replace(/^[-•\d.、\s]+/, '').trim())
      .filter((line) => line.length >= 4)
      .filter((line) => keywords.some((keyword) => line.includes(keyword)));
  }

  private static conversationTitle(question: string): string {
    const normalized = question
      .replace(/\s+/g, ' ')
      .replace(/[？?。！!，,；;：:]+$/g, '')
      .trim();
    return normalized.length > 19 ? normalized.slice(0, 19) : normalized || 'AI 健康咨询';
  }
}
