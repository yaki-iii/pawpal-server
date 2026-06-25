import type { Request, Response } from 'express';
import { AIService } from '../services/aiService';
import { ChatService } from '../services/chatService';
import { sendSuccess, sendError } from '../middleware/error';

/**
 * AIController — handles AI consultation requests, multi-turn chat, and session management.
 */
export class AIController {
  /**
   * POST /ai/consult
   * Run the AI consultation pipeline.
   */
  static async consult(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { question, petId, imageUrls } = req.body;
      const session = await AIService.runPipeline({
        userId: req.userId,
        question,
        petId,
        imageUrls: imageUrls || [],
      });
      sendSuccess(res, session, '咨询完成', 201);
    } catch (error) {
      sendError(res, 500, (error as Error).message || 'AI 咨询失败');
    }
  }

  /**
   * POST /ai/chat — multi-turn chat
   * If conversationId is provided, continues the existing conversation.
   * Otherwise starts a new conversation.
   */
  static async chat(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { message, conversationId, petId } = req.body;
      const reply = await ChatService.chat({
        userId: req.userId,
        message,
        conversationId,
        petId,
      });
      sendSuccess(res, reply, '回复成功', 201);
    } catch (error) {
      sendError(res, 500, (error as Error).message || 'AI 对话失败');
    }
  }

  /**
   * GET /ai/conversations — list user's conversations
   */
  static async listConversations(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const conversations = await ChatService.listConversations(req.userId);
      sendSuccess(res, conversations);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * GET /ai/conversations/:id/messages — get all messages in a conversation
   */
  static async getConversationMessages(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const messages = await ChatService.getConversationMessages(
        req.params.id,
        req.userId,
      );
      sendSuccess(res, messages);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在') || message.includes('无权')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 500, message);
      }
    }
  }

  /**
   * DELETE /ai/conversations/:id — delete a conversation
   */
  static async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      await ChatService.deleteConversation(req.params.id, req.userId);
      sendSuccess(res, null, '对话已删除');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在') || message.includes('无权')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 400, message);
      }
    }
  }

  /**
   * GET /ai/sessions
   * List all AI consultation sessions for the current user.
   */
  static async listSessions(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const sessions = await AIService.listByUser(req.userId);
      sendSuccess(res, sessions);
    } catch (error) {
      sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * GET /ai/sessions/:id
   * Get a single AI session by ID.
   */
  static async getSession(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const session = await AIService.getById(req.params.id, req.userId);
      sendSuccess(res, session);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('不存在')) {
        sendError(res, 404, message, undefined, 404);
      } else {
        sendError(res, 403, message, undefined, 403);
      }
    }
  }

  /**
   * PATCH /ai/sessions/:id
   * Update the status of an AI session.
   */
  static async updateSessionStatus(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        sendError(res, 401, '未授权');
        return;
      }
      const { status } = req.body;
      const session = await AIService.updateStatus(req.params.id, req.userId, status);
      sendSuccess(res, session, '更新成功');
    } catch (error) {
      sendError(res, 400, (error as Error).message || '更新失败');
    }
  }
}
