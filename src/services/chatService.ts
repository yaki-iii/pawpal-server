import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { llmClient } from './llmClient';
import { AIService } from './aiService';
import type { AIAssistantSessionDTO } from '../types';
import type { AIAssistantSession } from '@prisma/client';
import { randomUUID } from 'crypto';

/**
 * ConversationSummary — a lightweight conversation list item.
 */
export interface ConversationSummary {
  id: string;
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
  }): Promise<AIAssistantSessionDTO> {
    const { userId, message } = data;
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
        imageUrls: [],
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
    messages.push({ role: 'user', content: message });

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
        assistantReply = ChatService.buildFallbackReply(message);
      }
    } else {
      assistantReply = ChatService.buildFallbackReply(message);
    }

    // Save the assistant reply as a new message in the conversation
    const assistantMessage = await prisma.aIAssistantSession.create({
      data: {
        userId,
        petId: data.petId || null,
        question: message, // Original user question for context
        imageUrls: [],
        questionType: '',
        summary: assistantReply,
        sources: [],
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

    const conversationMap = new Map<string, { lastMessage: AIAssistantSession; count: number }>();
    for (const m of messages) {
      const cid = (m as { conversationId?: string | null }).conversationId;
      if (!cid) continue;
      if (!conversationMap.has(cid)) {
        conversationMap.set(cid, { lastMessage: m, count: 1 });
      } else {
        conversationMap.get(cid)!.count += 1;
      }
    }

    return Array.from(conversationMap.entries())
      .map(([id, { lastMessage, count }]) => ({
        id,
        lastMessage:
          (lastMessage as { role?: string }).role === 'assistant'
            ? lastMessage.summary.substring(0, 100)
            : lastMessage.question.substring(0, 100),
        lastMessageAt: lastMessage.createdAt.toISOString(),
        messageCount: count,
      }))
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
  static buildFallbackReply(userMessage: string): string {
    return (
      `感谢您的提问：「${userMessage.substring(0, 50)}」\n\n` +
      '目前 AI 服务暂时不可用，无法生成详细回复。您可以：\n' +
      '1. 在社区发布求助帖获取宠主经验\n' +
      '2. 使用 /api/v1/ai/consult 接口获取搜索增强的回答\n' +
      '3. 如果是紧急情况，请使用 /api/v1/emergency/help 接口\n\n' +
      '⚠️ 以上内容仅供参考，不构成专业兽医建议，复杂情况请及时就医。'
    );
  }
}
