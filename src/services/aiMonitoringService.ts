import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export type AICallProvider = 'DEEPSEEK_TEXT' | 'ARK_VISION' | 'FALLBACK';
export type AICallStatus = 'SUCCESS' | 'FAILED' | 'FALLBACK';

interface RecordAICallInput {
  userId?: string;
  conversationId?: string;
  provider: AICallProvider;
  model?: string;
  operation: string;
  status: AICallStatus;
  imageCount?: number;
  errorMessage?: string;
}

export class AIMonitoringService {
  static async recordCall(input: RecordAICallInput): Promise<void> {
    try {
      await prisma.aiCallLog.create({
        data: {
          userId: input.userId || null,
          conversationId: input.conversationId || '',
          provider: input.provider,
          model: input.model || '',
          operation: input.operation,
          status: input.status,
          imageCount: input.imageCount || 0,
          errorMessage: (input.errorMessage || '').slice(0, 500),
        },
      });
    } catch (error) {
      logger.warn(`AI call log write failed: ${(error as Error).message}`);
    }
  }
}
