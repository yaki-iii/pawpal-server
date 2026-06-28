import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { llmClient } from './llmClient';
import { AIService } from './aiService';
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

    // Call LLM (with fallback to a short canned reply)
    let assistantReply = '';
    if (llmClient.isConfigured()) {
      try {
        assistantReply = await llmClient.chat(messages, {
          temperature: 0.7,
          maxTokens: 1000,
        });
        logger.info(`Chat: assistant reply generated for conversation=${conversationId}`);
      } catch (error) {
        logger.warn(`Chat: LLM call failed, using fallback: ${(error as Error).message}`);
        assistantReply = ChatService.buildFallbackReply(message, imageUrls.length);
      }
    } else {
      assistantReply = ChatService.buildFallbackReply(message, imageUrls.length);
    }
    assistantReply = ChatService.ensureImageLimitationNotice(assistantReply, imageUrls.length);

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
        ? `\n\n已收到 ${imageCount} 张图片。当前模型暂不能直接识别图片内容，请补充文字描述：部位、颜色/形态变化、持续时间、精神食欲、是否疼痛或出血。`
        : '';

    return (
      `感谢您的提问：「${userMessage.substring(0, 50)}」\n\n` +
      `目前 AI 服务暂时不可用，无法生成详细回复。${imageFallback}\n\n您可以：\n` +
      '1. 在社区发布求助帖获取宠主经验\n' +
      '2. 使用 /api/v1/ai/consult 接口获取搜索增强的回答\n' +
      '3. 如果是紧急情况，请使用 /api/v1/emergency/help 接口\n\n' +
      '⚠️ 以上内容仅供参考，不构成专业兽医建议，复杂情况请及时就医。'
    );
  }

  private static ensureImageLimitationNotice(reply: string, imageCount: number): string {
    if (imageCount === 0 || reply.includes('不能直接识别图片')) {
      return reply;
    }

    return [
      reply,
      '',
      `已收到 ${imageCount} 张图片。当前 AI 暂不能直接识别图片细节，请补充文字描述：部位、颜色/形态变化、持续时间、精神食欲、是否疼痛或出血。`,
    ].join('\n');
  }

  private static buildUserPrompt(message: string, imageUrls: string[]): string {
    if (imageUrls.length === 0) {
      return message;
    }

    return [
      message,
      '',
      `用户上传了 ${imageUrls.length} 张图片，请结合这些图片 URL 进行初步观察；如果当前模型不能直接识别图片，请明确说明需要用户补充文字描述。`,
      ...imageUrls.map((url, index) => `图片 ${index + 1}: ${url}`),
    ].join('\n');
  }

  static buildResultCard(
    userMessage: string,
    assistantReply: string,
    imageUrls: string[] = [],
  ): AIResultCardDTO | undefined {
    const text = `${userMessage}\n${assistantReply}`.toLowerCase();
    const emergencyKeywords = ['呼吸困难', '大量出血', '抽搐', '中毒', '昏迷', '不能站立'];
    const mediumKeywords = ['呕吐', '腹泻', '红', '肿', '分泌物', '皮肤', '眼', '耳', '疼', '不吃'];
    const severity: AIResultCardDTO['severity'] = emergencyKeywords.some((keyword) => text.includes(keyword))
      ? 'high'
      : imageUrls.length > 0 || mediumKeywords.some((keyword) => text.includes(keyword))
        ? 'medium'
        : 'low';

    const visualFindings = imageUrls.length > 0
      ? [`已收到 ${imageUrls.length} 张图片`, '请结合文字描述判断部位、颜色、形态和变化速度']
      : ['暂无图片输入，建议补充清晰照片帮助观察'];

    const possibleCauses = ChatService.possibleCausesFor(text);
    const shouldSeeVet = severity !== 'low';

    return {
      severity,
      visualFindings,
      possibleCauses,
      suggestions: [
        '记录图片变化，观察 24 小时内是否加重',
        '补充精神、食欲、饮水、排便和疼痛反应等信息',
        '避免自行用药或使用人用药剂量',
      ],
      shouldSeeVet,
      vetReminder: shouldSeeVet
        ? '如果出现持续红肿、脓性分泌物、明显疼痛或精神食欲下降，请尽快联系兽医。'
        : '如症状持续超过 24-48 小时或出现精神食欲下降，请咨询兽医。',
    };
  }

  private static possibleCausesFor(text: string): string[] {
    if (text.includes('眼') || text.includes('红') || text.includes('分泌物')) {
      return ['眼部刺激或炎症', '异物摩擦', '过敏或感染风险'];
    }
    if (text.includes('皮肤') || text.includes('痒') || text.includes('掉毛')) {
      return ['皮肤刺激或过敏', '寄生虫或真菌风险', '舔咬导致局部加重'];
    }
    if (text.includes('呕吐') || text.includes('腹泻') || text.includes('不吃')) {
      return ['饮食变化或消化不适', '胃肠道感染风险', '误食异物或应激反应'];
    }
    return ['症状信息仍不完整', '环境或饮食变化', '需要结合持续时间和精神食欲判断'];
  }

  private static conversationTitle(question: string): string {
    const normalized = question
      .replace(/\s+/g, ' ')
      .replace(/[？?。！!，,；;：:]+$/g, '')
      .trim();
    return normalized.length > 19 ? normalized.slice(0, 19) : normalized || 'AI 健康咨询';
  }
}
