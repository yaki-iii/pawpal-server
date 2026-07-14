jest.mock('../src/config/database', () => ({
  prisma: {
    post: {
      findUnique: jest.fn(),
    },
    moment: {
      findUnique: jest.fn(),
    },
    comment: {
      findUnique: jest.fn(),
    },
    momentComment: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    circle: {
      findUnique: jest.fn(),
    },
    contentReport: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { prisma } from '../src/config/database';
import { ReportService } from '../src/services/reportService';

describe('ReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a content report for a post owned by another user', async () => {
    (prisma.post.findUnique as jest.Mock).mockResolvedValue({
      id: 'post-1',
      userId: 'author-1',
      title: '错误医疗建议',
      content: '给猫随便吃药',
    });
    (prisma.contentReport.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.contentReport.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 'report-1',
      ...data,
      duplicateCount: 1,
      status: 'PENDING',
      createdAt: new Date('2026-07-03T00:00:00Z'),
      updatedAt: new Date('2026-07-03T00:00:00Z'),
      lastReportedAt: new Date('2026-07-03T00:00:00Z'),
    }));

    const report = await ReportService.createReport('reporter-1', {
      targetType: 'POST',
      targetId: 'post-1',
      reason: 'FALSE_MEDICAL',
      note: '这条建议可能有危险',
    });

    expect(report.id).toBe('report-1');
    expect(report.status).toBe('PENDING');
    expect(report.targetOwnerId).toBe('author-1');
    expect(prisma.contentReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reporterId: 'reporter-1',
        targetType: 'POST',
        targetId: 'post-1',
        targetOwnerId: 'author-1',
        reason: 'FALSE_MEDICAL',
        note: '这条建议可能有危险',
      }),
    });
  });

  it('merges duplicate open reports from the same reporter and target', async () => {
    (prisma.post.findUnique as jest.Mock).mockResolvedValue({
      id: 'post-1',
      userId: 'author-1',
    });
    (prisma.contentReport.findFirst as jest.Mock).mockResolvedValue({
      id: 'report-1',
      reporterId: 'reporter-1',
      targetType: 'POST',
      targetId: 'post-1',
      targetOwnerId: 'author-1',
      reason: 'SPAM',
      note: '',
      duplicateCount: 1,
      status: 'PENDING',
      createdAt: new Date('2026-07-03T00:00:00Z'),
      updatedAt: new Date('2026-07-03T00:00:00Z'),
      lastReportedAt: new Date('2026-07-03T00:00:00Z'),
    });
    (prisma.contentReport.update as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 'report-1',
      reporterId: 'reporter-1',
      targetType: 'POST',
      targetId: 'post-1',
      targetOwnerId: 'author-1',
      reason: 'SPAM',
      note: '重复广告',
      duplicateCount: 2,
      status: 'PENDING',
      createdAt: new Date('2026-07-03T00:00:00Z'),
      updatedAt: new Date('2026-07-03T01:00:00Z'),
      lastReportedAt: data.lastReportedAt,
    }));

    const report = await ReportService.createReport('reporter-1', {
      targetType: 'POST',
      targetId: 'post-1',
      reason: 'SPAM',
      note: '重复广告',
    });

    expect(report.duplicateCount).toBe(2);
    expect(prisma.contentReport.create).not.toHaveBeenCalled();
    expect(prisma.contentReport.update).toHaveBeenCalledWith({
      where: { id: 'report-1' },
      data: expect.objectContaining({
        duplicateCount: { increment: 1 },
        reason: 'SPAM',
        note: '重复广告',
      }),
    });
  });

  it('rejects reporting your own post', async () => {
    (prisma.post.findUnique as jest.Mock).mockResolvedValue({
      id: 'post-1',
      userId: 'reporter-1',
    });

    await expect(
      ReportService.createReport('reporter-1', {
        targetType: 'POST',
        targetId: 'post-1',
        reason: 'OTHER',
      }),
    ).rejects.toThrow('不能举报自己的内容');
  });

  it('lists only reports created by the current user', async () => {
    (prisma.contentReport.findMany as jest.Mock).mockResolvedValue([{
      id: 'report-1', reporterId: 'reporter-1', targetType: 'POST', targetId: 'post-1',
      targetOwnerId: 'author-1', reason: 'SPAM', note: '', duplicateCount: 1,
      status: 'REVIEWING', createdAt: new Date('2026-07-03T00:00:00Z'),
      updatedAt: new Date('2026-07-03T01:00:00Z'), lastReportedAt: new Date('2026-07-03T00:00:00Z'),
    }]);

    const reports = await ReportService.listByReporter('reporter-1');

    expect(reports).toHaveLength(1);
    expect(prisma.contentReport.findMany).toHaveBeenCalledWith({
      where: { reporterId: 'reporter-1' },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  });
});
