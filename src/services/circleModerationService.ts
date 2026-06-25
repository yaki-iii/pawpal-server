import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type {
  CircleMemberDTO,
  CircleJoinRequestDTO,
  CircleDTO,
  PaginatedResult,
} from '../types';
import { AuthService } from './authService';
import { NotificationService } from './notificationService';

/**
 * CircleModerationService — Reddit-style circle moderation.
 *
 * Permission model:
 *  - OWNER: full control (edit, delete, members, posts, visibility, rules)
 *  - MODERATOR: manage members + posts (ban, kick, warn, remove, pin), cannot delete circle
 *  - MEMBER: post + comment (RESTRICTED requires membership)
 *
 * All moderation actions are recorded for audit:
 *  - CircleBan (封禁记录)
 *  - PostRemoval (移除帖子记录)
 *  - UserWarning (警告记录)
 */
export class CircleModerationService {
  // ---- Circle CRUD ----

  /**
   * Edit circle info. Only OWNER can edit.
   */
  static async editCircle(
    circleId: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
      coverImage?: string;
      rules?: string;
    },
  ): Promise<CircleDTO> {
    const circle = await prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new Error('圈子不存在');
    if (circle.ownerId !== userId) throw new Error('只有圈主才能编辑圈子信息');

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      // Check name uniqueness if changing
      if (data.name !== circle.name) {
        const existing = await prisma.circle.findUnique({ where: { name: data.name } });
        if (existing && existing.id !== circleId) {
          throw new Error('圈子名称已存在，请换一个');
        }
        updateData.name = data.name;
      }
    }
    if (data.description !== undefined) updateData.description = data.description;
    if (data.coverImage !== undefined) updateData.coverImage = data.coverImage;
    if (data.rules !== undefined) updateData.rules = data.rules;

    const updated = await prisma.circle.update({
      where: { id: circleId },
      data: updateData,
    });

    logger.info(`Circle edited: ${circleId} by user ${userId}`);
    return CircleModerationService.toCircleDTO(updated);
  }

  /**
   * Delete (dissolve) a circle. Only OWNER can delete.
   */
  static async deleteCircle(circleId: string, userId: string): Promise<void> {
    const circle = await prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new Error('圈子不存在');
    if (circle.ownerId !== userId) throw new Error('只有圈主才能解散圈子');

    await prisma.circle.delete({ where: { id: circleId } });
    logger.info(`Circle dissolved: ${circleId} by owner ${userId}`);
  }

  /**
   * Set circle visibility. Only OWNER can change.
   */
  static async setVisibility(
    circleId: string,
    userId: string,
    visibility: 'PUBLIC' | 'RESTRICTED' | 'PRIVATE',
  ): Promise<CircleDTO> {
    const circle = await prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new Error('圈子不存在');
    if (circle.ownerId !== userId) throw new Error('只有圈主才能修改圈子可见性');

    const updated = await prisma.circle.update({
      where: { id: circleId },
      data: { visibility },
    });

    logger.info(`Circle visibility set to ${visibility}: ${circleId}`);
    return CircleModerationService.toCircleDTO(updated);
  }

  // ---- Join Requests ----

  /**
   * Submit a join request for RESTRICTED/PRIVATE circles.
   * PUBLIC circles auto-approve (caller should use joinCircle instead).
   */
  static async submitJoinRequest(
    circleId: string,
    userId: string,
    message: string,
  ): Promise<CircleJoinRequestDTO> {
    const circle = await prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new Error('圈子不存在');
    if (circle.visibility === 'PUBLIC') {
      throw new Error('公开圈子无需申请，请直接加入');
    }

    // Check existing membership
    const membership = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (membership && membership.status === 'ACTIVE') {
      throw new Error('您已经是该圈子成员');
    }

    // Check existing pending request
    const existingReq = await prisma.circleJoinRequest.findFirst({
      where: { circleId, userId, status: 'PENDING' },
    });
    if (existingReq) {
      throw new Error('您已提交过申请，请等待审核');
    }

    const req = await prisma.circleJoinRequest.create({
      data: { circleId, userId, message },
    });

    // Notify circle owner
    if (circle.ownerId && circle.ownerId !== userId) {
      await NotificationService.create({
        userId: circle.ownerId,
        type: 'SYSTEM',
        content: `有新用户申请加入您的圈子「${circle.name}」`,
        linkUrl: `/circles/${circleId}/join-requests`,
      });
    }

    logger.info(`Join request submitted: circle=${circleId} user=${userId}`);
    return CircleModerationService.toJoinRequestDTO(req);
  }

  /**
   * List pending join requests. Only OWNER/MODERATOR.
   */
  static async listJoinRequests(
    circleId: string,
    userId: string,
    status?: string,
  ): Promise<CircleJoinRequestDTO[]> {
    await CircleModerationService.assertModerator(circleId, userId);

    const where: Record<string, unknown> = { circleId };
    if (status) where.status = status;

    const requests = await prisma.circleJoinRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    return requests.map((r) => {
      const dto = CircleModerationService.toJoinRequestDTO(r);
      if (r.user) dto.user = AuthService.toDTO(r.user);
      return dto;
    });
  }

  /**
   * Approve a join request. Adds user as MEMBER.
   */
  static async approveJoinRequest(
    circleId: string,
    requestId: string,
    userId: string,
  ): Promise<void> {
    await CircleModerationService.assertModerator(circleId, userId);

    const req = await prisma.circleJoinRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new Error('申请不存在');
    if (req.circleId !== circleId) throw new Error('申请不属于该圈子');
    if (req.status !== 'PENDING') throw new Error('该申请已处理');

    // Update request
    await prisma.circleJoinRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: userId },
    });

    // Add as member (idempotent — if already exists from a prior kick, reactivate)
    const existing = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId: req.userId } },
    });
    if (existing) {
      await prisma.circleMember.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', role: 'MEMBER' },
      });
    } else {
      await prisma.circleMember.create({
        data: { circleId, userId: req.userId, role: 'MEMBER' },
      });
      await prisma.circle.update({
        where: { id: circleId },
        data: { memberCount: { increment: 1 } },
      });
    }

    // Notify user
    await NotificationService.create({
      userId: req.userId,
      type: 'SYSTEM',
      content: `您的加入申请已通过，欢迎加入圈子`,
      linkUrl: `/circles/${circleId}`,
    });

    logger.info(`Join request approved: req=${requestId} by user=${userId}`);
  }

  /**
   * Reject a join request.
   */
  static async rejectJoinRequest(
    circleId: string,
    requestId: string,
    userId: string,
  ): Promise<void> {
    await CircleModerationService.assertModerator(circleId, userId);

    const req = await prisma.circleJoinRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new Error('申请不存在');
    if (req.circleId !== circleId) throw new Error('申请不属于该圈子');
    if (req.status !== 'PENDING') throw new Error('该申请已处理');

    await prisma.circleJoinRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy: userId },
    });

    await NotificationService.create({
      userId: req.userId,
      type: 'SYSTEM',
      content: `您的加入申请未通过`,
      linkUrl: `/circles/${circleId}`,
    });

    logger.info(`Join request rejected: req=${requestId} by user=${userId}`);
  }

  // ---- Member Management ----

  /**
   * List members of a circle with pagination.
   */
  static async listMembers(
    circleId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<PaginatedResult<CircleMemberDTO>> {
    const where: Record<string, unknown> = { circleId };
    if (cursor) {
      where.joinedAt = { lt: new Date(cursor) };
    }

    const members = await prisma.circleMember.findMany({
      where,
      orderBy: [{ role: 'desc' }, { joinedAt: 'desc' }],
      take: limit + 1,
      include: { user: true },
    });

    const hasMore = members.length > limit;
    const items = members.slice(0, limit).map((m) => {
      const dto = CircleModerationService.toMemberDTO(m);
      if (m.user) dto.user = AuthService.toDTO(m.user);
      return dto;
    });

    return {
      items,
      nextCursor: hasMore && items.length > 0
        ? items[items.length - 1].joinedAt
        : null,
    };
  }

  /**
   * Ban (禁言) a member. MODERATOR+ only. Cannot ban OWNER.
   */
  static async banMember(
    circleId: string,
    targetUserId: string,
    moderatorId: string,
    data: { reason: string; bannedUntil?: string },
  ): Promise<void> {
    await CircleModerationService.assertModerator(circleId, moderatorId);

    const target = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId: targetUserId } },
    });
    if (!target) throw new Error('该用户不是圈子成员');
    if (target.role === 'OWNER') throw new Error('不能禁言圈主');

    const bannedUntil = data.bannedUntil ? new Date(data.bannedUntil) : null;

    // Update member status
    await prisma.circleMember.update({
      where: { id: target.id },
      data: { status: 'BANNED', bannedUntil },
    });

    // Record ban
    await prisma.circleBan.upsert({
      where: { circleId_userId: { circleId, userId: targetUserId } },
      update: { reason: data.reason, bannedBy: moderatorId, bannedUntil },
      create: {
        circleId,
        userId: targetUserId,
        reason: data.reason,
        bannedBy: moderatorId,
        bannedUntil,
      },
    });

    await NotificationService.create({
      userId: targetUserId,
      type: 'SYSTEM',
      content: `您在圈子中被禁言。原因：${data.reason}`,
      linkUrl: `/circles/${circleId}`,
    });

    logger.info(`Member banned: circle=${circleId} target=${targetUserId} by=${moderatorId}`);
  }

  /**
   * Kick (踢出) a member. MODERATOR+ only. Cannot kick OWNER.
   */
  static async kickMember(
    circleId: string,
    targetUserId: string,
    moderatorId: string,
    reason: string,
  ): Promise<void> {
    await CircleModerationService.assertModerator(circleId, moderatorId);

    const target = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId: targetUserId } },
    });
    if (!target) throw new Error('该用户不是圈子成员');
    if (target.role === 'OWNER') throw new Error('不能踢出圈主');

    await prisma.circleMember.update({
      where: { id: target.id },
      data: { status: 'KICKED' },
    });
    await prisma.circle.update({
      where: { id: circleId },
      data: { memberCount: { decrement: 1 } },
    });

    await NotificationService.create({
      userId: targetUserId,
      type: 'SYSTEM',
      content: `您被踢出圈子。原因：${reason}`,
      linkUrl: `/circles/${circleId}`,
    });

    logger.info(`Member kicked: circle=${circleId} target=${targetUserId} by=${moderatorId} reason=${reason}`);
  }

  /**
   * Warn a member. Increments warningCount; auto-ban after 3 warnings.
   */
  static async warnMember(
    circleId: string,
    targetUserId: string,
    moderatorId: string,
    reason: string,
  ): Promise<{ warningCount: number; autoBanned: boolean }> {
    await CircleModerationService.assertModerator(circleId, moderatorId);

    const target = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId: targetUserId } },
    });
    if (!target) throw new Error('该用户不是圈子成员');
    if (target.role === 'OWNER') throw new Error('不能警告圈主');

    // Record warning
    await prisma.userWarning.create({
      data: { userId: targetUserId, circleId, reason, warnedBy: moderatorId },
    });

    const newCount = target.warningCount + 1;
    let autoBanned = false;

    if (newCount >= 3) {
      // Auto-ban for 7 days after 3 warnings
      const banUntil = new Date();
      banUntil.setDate(banUntil.getDate() + 7);
      await prisma.circleMember.update({
        where: { id: target.id },
        data: {
          warningCount: newCount,
          status: 'BANNED',
          bannedUntil: banUntil,
        },
      });
      await prisma.circleBan.upsert({
        where: { circleId_userId: { circleId, userId: targetUserId } },
        update: {
          reason: `累计 ${newCount} 次警告自动禁言`,
          bannedBy: moderatorId,
          bannedUntil: banUntil,
        },
        create: {
          circleId,
          userId: targetUserId,
          reason: `累计 ${newCount} 次警告自动禁言`,
          bannedBy: moderatorId,
          bannedUntil: banUntil,
        },
      });
      autoBanned = true;
    } else {
      await prisma.circleMember.update({
        where: { id: target.id },
        data: { warningCount: newCount },
      });
    }

    await NotificationService.create({
      userId: targetUserId,
      type: 'SYSTEM',
      content: `您在圈子中收到警告（第${newCount}次）。原因：${reason}${autoBanned ? '。累计3次警告已自动禁言7天' : ''}`,
      linkUrl: `/circles/${circleId}`,
    });

    logger.info(`Member warned: circle=${circleId} target=${targetUserId} count=${newCount} autoBanned=${autoBanned}`);
    return { warningCount: newCount, autoBanned };
  }

  /**
   * Promote a member to MODERATOR. OWNER only.
   */
  static async promoteMember(
    circleId: string,
    targetUserId: string,
    ownerId: string,
  ): Promise<void> {
    const circle = await prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new Error('圈子不存在');
    if (circle.ownerId !== ownerId) throw new Error('只有圈主才能提升管理员');

    const target = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId: targetUserId } },
    });
    if (!target) throw new Error('该用户不是圈子成员');
    if (target.role === 'OWNER') throw new Error('操作无效');
    if (target.role === 'MODERATOR') throw new Error('该用户已是管理员');

    await prisma.circleMember.update({
      where: { id: target.id },
      data: { role: 'MODERATOR' },
    });

    await NotificationService.create({
      userId: targetUserId,
      type: 'SYSTEM',
      content: `您已被提升为圈子管理员`,
      linkUrl: `/circles/${circleId}`,
    });

    logger.info(`Member promoted: circle=${circleId} target=${targetUserId}`);
  }

  /**
   * Demote a moderator back to MEMBER. OWNER only.
   */
  static async demoteMember(
    circleId: string,
    targetUserId: string,
    ownerId: string,
  ): Promise<void> {
    const circle = await prisma.circle.findUnique({ where: { id: circleId } });
    if (!circle) throw new Error('圈子不存在');
    if (circle.ownerId !== ownerId) throw new Error('只有圈主才能降级管理员');

    const target = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId: targetUserId } },
    });
    if (!target) throw new Error('该用户不是圈子成员');
    if (target.role !== 'MODERATOR') throw new Error('该用户不是管理员');

    await prisma.circleMember.update({
      where: { id: target.id },
      data: { role: 'MEMBER' },
    });

    logger.info(`Member demoted: circle=${circleId} target=${targetUserId}`);
  }

  // ---- Post Moderation ----

  /**
   * Remove (hide) a post from the circle. MODERATOR+.
   * Sets isRemoved=true and records the removal.
   */
  static async removePost(
    circleId: string,
    postId: string,
    moderatorId: string,
    reason: string,
  ): Promise<void> {
    await CircleModerationService.assertModerator(circleId, moderatorId);

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new Error('帖子不存在');
    if (post.circleId !== circleId) throw new Error('帖子不属于该圈子');
    if (post.isRemoved) throw new Error('帖子已被移除');

    await prisma.post.update({
      where: { id: postId },
      data: { isRemoved: true },
    });
    await prisma.postRemoval.create({
      data: { postId, circleId, removedBy: moderatorId, reason },
    });

    await NotificationService.create({
      userId: post.userId,
      type: 'SYSTEM',
      content: `您在圈子中的帖子「${post.title}」已被管理员移除。原因：${reason}`,
      linkUrl: `/circles/${circleId}`,
    });

    logger.info(`Post removed: post=${postId} circle=${circleId} by=${moderatorId}`);
  }

  /**
   * Pin/unpin a post in the circle. MODERATOR+.
   */
  static async togglePinPost(
    circleId: string,
    postId: string,
    moderatorId: string,
  ): Promise<{ isPinned: boolean }> {
    await CircleModerationService.assertModerator(circleId, moderatorId);

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new Error('帖子不存在');
    if (post.circleId !== circleId) throw new Error('帖子不属于该圈子');

    const newPinned = !post.isPinned;
    await prisma.post.update({
      where: { id: postId },
      data: { isPinned: newPinned },
    });

    logger.info(`Post ${newPinned ? 'pinned' : 'unpinned'}: post=${postId} circle=${circleId} by=${moderatorId}`);
    return { isPinned: newPinned };
  }

  // ---- Queries ----

  /**
   * List circles created by a user.
   */
  static async listCreatedCircles(userId: string): Promise<CircleDTO[]> {
    const circles = await prisma.circle.findMany({
      where: { createdByUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return circles.map(CircleModerationService.toCircleDTO);
  }

  // ---- Helpers ----

  /**
   * Assert that the user is OWNER or MODERATOR of the circle.
   * Throws if not authorized.
   */
  static async assertModerator(circleId: string, userId: string): Promise<void> {
    const membership = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
    });
    if (!membership) throw new Error('您不是该圈子成员');
    if (membership.status !== 'ACTIVE') throw new Error('您的圈子成员状态异常');
    if (membership.role !== 'OWNER' && membership.role !== 'MODERATOR') {
      throw new Error('需要圈主或管理员权限');
    }
  }

  // ---- DTO Converters ----

  static toCircleDTO(circle: {
    id: string;
    name: string;
    type: string;
    species: string | null;
    coverImage: string;
    description: string;
    ownerId: string | null;
    createdByUserId: string | null;
    isVerified: boolean;
    rules: string;
    visibility: string;
    moderatorNote: string;
    lastActiveAt: Date;
    memberCount: number;
    postCount: number;
    createdAt: Date;
  }): CircleDTO {
    return {
      id: circle.id,
      name: circle.name,
      type: circle.type,
      species: circle.species,
      coverImage: circle.coverImage,
      description: circle.description,
      ownerId: circle.ownerId,
      createdByUserId: circle.createdByUserId,
      isVerified: circle.isVerified,
      rules: circle.rules,
      visibility: circle.visibility,
      moderatorNote: circle.moderatorNote,
      lastActiveAt: circle.lastActiveAt.toISOString(),
      memberCount: circle.memberCount,
      postCount: circle.postCount,
      createdAt: circle.createdAt.toISOString(),
    };
  }

  static toMemberDTO(member: {
    id: string;
    circleId: string;
    userId: string;
    role: string;
    status: string;
    bannedUntil: Date | null;
    warningCount: number;
    joinedAt: Date;
  }): CircleMemberDTO {
    return {
      id: member.id,
      circleId: member.circleId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      bannedUntil: member.bannedUntil ? member.bannedUntil.toISOString() : null,
      warningCount: member.warningCount,
      joinedAt: member.joinedAt.toISOString(),
    };
  }

  static toJoinRequestDTO(req: {
    id: string;
    circleId: string;
    userId: string;
    message: string;
    status: string;
    createdAt: Date;
    reviewedAt: Date | null;
    reviewedBy: string | null;
  }): CircleJoinRequestDTO {
    return {
      id: req.id,
      circleId: req.circleId,
      userId: req.userId,
      message: req.message,
      status: req.status,
      createdAt: req.createdAt.toISOString(),
      reviewedAt: req.reviewedAt ? req.reviewedAt.toISOString() : null,
      reviewedBy: req.reviewedBy,
    };
  }
}
