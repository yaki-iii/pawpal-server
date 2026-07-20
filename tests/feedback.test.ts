import { FeedbackService } from '../src/services/feedbackService';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: { userFeedback: { create: jest.fn() } },
}));

describe('FeedbackService screenshot handling', () => {
  beforeEach(() => jest.clearAllMocks());

  const mockCreate = (overrides = {}) => {
    (prisma.userFeedback.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 'feedback-1',
      ...data,
      status: 'PENDING',
      createdAt: new Date('2026-07-14T00:00:00Z'),
      updatedAt: new Date('2026-07-14T00:00:00Z'),
      ...overrides,
    }));
  };

  it('should save feedback with a single screenshot URL', async () => {
    mockCreate();
    const result = await FeedbackService.create('user-1', {
      category: '功能异常',
      description: '按钮没有响应',
      screenshotUrls: ['https://cdn.example.com/1.jpg'],
    });

    expect(prisma.userFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        screenshotUrls: ['https://cdn.example.com/1.jpg'],
      }),
    });
    expect(result.id).toBe('feedback-1');
  });

  it('should save feedback with 5 screenshot URLs', async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://cdn.example.com/${i + 1}.jpg`);
    mockCreate();

    await FeedbackService.create('user-1', {
      category: '功能异常',
      description: '多个截图',
      screenshotUrls: urls,
    });

    expect(prisma.userFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ screenshotUrls: urls }),
    });
  });

  it('should save feedback with 9 screenshot URLs (upper limit)', async () => {
    const urls = Array.from({ length: 9 }, (_, i) => `https://cdn.example.com/${i + 1}.jpg`);
    mockCreate();

    await FeedbackService.create('user-1', {
      category: '功能异常',
      description: '9个截图',
      screenshotUrls: urls,
    });

    expect(prisma.userFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ screenshotUrls: urls }),
    });
  });

  it('should truncate to 9 URLs when more than 9 are provided', async () => {
    const urls = Array.from({ length: 12 }, (_, i) => `https://cdn.example.com/${i + 1}.jpg`);
    mockCreate();

    await FeedbackService.create('user-1', {
      category: '功能异常',
      description: '太多截图',
      screenshotUrls: urls,
    });

    const savedUrls = (prisma.userFeedback.create as jest.Mock).mock.calls[0][0].data.screenshotUrls;
    expect(savedUrls).toHaveLength(9);
  });

  it('should allow feedback submission without screenshot URLs', async () => {
    mockCreate();
    await FeedbackService.create('user-1', {
      category: '建议',
      description: '希望增加夜间模式',
    });

    expect(prisma.userFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ screenshotUrls: [] }),
    });
  });
});
