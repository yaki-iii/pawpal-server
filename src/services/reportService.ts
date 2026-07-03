import { prisma } from '../config/database';

type ReportTargetType = 'POST' | 'MOMENT' | 'COMMENT' | 'MOMENT_COMMENT' | 'USER' | 'CIRCLE';
type ReportReason = 'SPAM' | 'HARASSMENT' | 'FALSE_MEDICAL' | 'ILLEGAL_DANGEROUS' | 'INAPPROPRIATE_MEDIA' | 'PRIVACY' | 'OTHER';

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  note?: string;
}

export class ReportService {
  static async createReport(reporterId: string, input: CreateReportInput): Promise<Record<string, unknown>> {
    const targetOwnerId = await ReportService.findTargetOwnerId(input.targetType, input.targetId);
    if (targetOwnerId && targetOwnerId === reporterId) {
      throw new Error(input.targetType === 'USER' ? '不能举报自己' : '不能举报自己的内容');
    }

    const existing = await prisma.contentReport.findFirst({
      where: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        status: { in: ['PENDING', 'REVIEWING'] },
      },
    });

    if (existing) {
      const updated = await prisma.contentReport.update({
        where: { id: existing.id },
        data: {
          reason: input.reason,
          note: input.note || existing.note || '',
          duplicateCount: { increment: 1 },
          lastReportedAt: new Date(),
        },
      });
      return ReportService.toDTO(updated);
    }

    const report = await prisma.contentReport.create({
      data: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        targetOwnerId,
        reason: input.reason,
        note: input.note || '',
      },
    });

    return ReportService.toDTO(report);
  }

  private static async findTargetOwnerId(type: ReportTargetType, id: string): Promise<string> {
    if (type === 'POST') {
      const post = await prisma.post.findUnique({ where: { id } });
      if (!post) throw new Error('举报对象不存在');
      return post.userId;
    }
    if (type === 'MOMENT') {
      const moment = await prisma.moment.findUnique({ where: { id } });
      if (!moment) throw new Error('举报对象不存在');
      return moment.userId;
    }
    if (type === 'COMMENT') {
      const comment = await prisma.comment.findUnique({ where: { id } });
      if (!comment) throw new Error('举报对象不存在');
      return comment.userId;
    }
    if (type === 'MOMENT_COMMENT') {
      const comment = await prisma.momentComment.findUnique({ where: { id } });
      if (!comment) throw new Error('举报对象不存在');
      return comment.userId;
    }
    if (type === 'USER') {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user || user.deletedAt) throw new Error('举报对象不存在');
      return user.id;
    }

    const circle = await prisma.circle.findUnique({ where: { id } });
    if (!circle) throw new Error('举报对象不存在');
    return circle.ownerId || circle.createdByUserId || '';
  }

  static toDTO(report: Record<string, any>): Record<string, unknown> {
    return {
      id: report.id,
      reporterId: report.reporterId,
      targetType: report.targetType,
      targetId: report.targetId,
      targetOwnerId: report.targetOwnerId || '',
      reason: report.reason,
      note: report.note || '',
      status: report.status,
      duplicateCount: report.duplicateCount || 1,
      resolutionAction: report.resolutionAction || null,
      resolutionNote: report.resolutionNote || '',
      handledByAdminId: report.handledByAdminId || null,
      handledAt: report.handledAt ? report.handledAt.toISOString() : null,
      lastReportedAt: report.lastReportedAt ? report.lastReportedAt.toISOString() : null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }
}
