import { Router } from 'express';
import { AIController } from '../controllers/aiController';
import { requireAuth } from '../middleware/auth';
import { aiRateLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All AI routes require authentication
router.use(requireAuth);

// Validation schema for consult
const consultSchema = z.object({
  question: z.string().min(5, '请详细描述问题（至少5个字）').max(1000, '问题最多1000字'),
  petId: z.string().optional(),
  imageUrls: z.array(z.string()).max(4, '最多上传4张图片').default([]),
});

// Validation schema for multi-turn chat
const chatSchema = z.object({
  message: z.string().min(1, '请输入消息内容').max(2000, '消息最多2000字'),
  conversationId: z.string().optional(),
  petId: z.string().optional(),
});

// Validation schema for status update
const statusSchema = z.object({
  status: z.enum(['OBSERVING', 'RECOVERED', 'VISITED_DOCTOR']),
});

// ---- Multi-turn chat routes (specific paths before /:id) ----
router.post('/chat', aiRateLimiter, validateBody(chatSchema), AIController.chat);
router.get('/conversations', AIController.listConversations);
router.get('/conversations/:id/messages', AIController.getConversationMessages);
router.delete('/conversations/:id', AIController.deleteConversation);

// ---- Legacy one-shot consultation routes ----
router.post('/consult', aiRateLimiter, validateBody(consultSchema), AIController.consult);
router.get('/sessions', AIController.listSessions);
router.get('/sessions/:id', AIController.getSession);
router.patch('/sessions/:id', validateBody(statusSchema), AIController.updateSessionStatus);

export default router;
