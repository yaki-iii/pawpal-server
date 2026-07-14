import { prisma } from '../config/database';

export interface FeedbackInput {
  category: string;
  description: string;
  contact?: string;
  screenshotUrls?: string[];
}

export class FeedbackService {
  static async create(userId: string, input: FeedbackInput): Promise<Record<string, unknown>> {
    const feedback = await prisma.userFeedback.create({
      data: {
        userId,
        category: input.category,
        description: input.description,
        contact: input.contact || '',
        screenshotUrls: (input.screenshotUrls || []).slice(0, 9),
      },
    });
    return {
      ...feedback,
      createdAt: feedback.createdAt.toISOString(),
      updatedAt: feedback.updatedAt.toISOString(),
    };
  }
}
