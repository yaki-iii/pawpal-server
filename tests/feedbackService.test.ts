import { FeedbackService } from '../src/services/feedbackService';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: { userFeedback: { create: jest.fn() } },
}));

describe('FeedbackService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores authenticated feedback with up to nine screenshots', async () => {
    (prisma.userFeedback.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 'feedback-1', ...data, status: 'PENDING', createdAt: new Date('2026-07-14T00:00:00Z'), updatedAt: new Date('2026-07-14T00:00:00Z'),
    }));

    const result = await FeedbackService.create('user-1', {
      category: '功能异常', description: '按钮没有响应', contact: 'user@example.com', screenshotUrls: ['https://cdn.example.com/1.jpg'],
    });

    expect(result.id).toBe('feedback-1');
    expect(prisma.userFeedback.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'user-1', screenshotUrls: ['https://cdn.example.com/1.jpg'] }) });
  });
});
