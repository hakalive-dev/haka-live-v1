import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { computeAge } from '../accounts/accounts.service';
import {
  notifyMomentCommented,
  notifyMomentGifted,
  notifyMomentLiked,
  notifyMomentShared,
} from './moments-notify.service';

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  country: true,
  gender: true,
  dateOfBirth: true,
  level: { select: { richLevel: true, charmLevel: true } },
};

function formatAuthor(u: {
  id: string;
  username: string | null;
  displayName: string;
  avatar: string;
  country: string;
  gender: string;
  dateOfBirth: Date | null;
  level: { richLevel: number; charmLevel: number } | null;
}) {
  return {
    id: u.id,
    username: u.username ?? '',
    displayName: u.displayName,
    avatar: u.avatar || null,
    country: u.country,
    gender: u.gender,
    date_of_birth: u.dateOfBirth?.toISOString() ?? null,
    age: computeAge(u.dateOfBirth),
    rich_level: u.level?.richLevel ?? 1,
    charm_level: u.level?.charmLevel ?? 1,
  };
}

function formatMoment(
  m: {
    id: string;
    postType: string;
    mediaUrl: string | null;
    posterUrl: string | null;
    caption: string;
    hashtag: string;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    giftsCount: number;
    createdAt: Date;
    user: Parameters<typeof formatAuthor>[0];
  },
  isLiked: boolean,
) {
  return {
    id: m.id,
    user: formatAuthor(m.user),
    post_type: m.postType,
    media_url: m.mediaUrl,
    poster_url: m.posterUrl,
    caption: m.caption,
    hashtag: m.hashtag,
    likes_count: m.likesCount,
    comments_count: m.commentsCount,
    shares_count: m.sharesCount,
    gifts_count: m.giftsCount,
    is_liked: isLiked,
    created_at: m.createdAt.toISOString(),
  };
}

export const momentsService = {
  async list(
    callerId: string,
    type: 'moment' | 'video' | undefined,
    page: number,
    pageSize: number,
  ) {
    const where = type ? { postType: type } : {};
    const [items, count] = await Promise.all([
      prisma.moment.findMany({
        where,
        include: { user: { select: userSelect } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.moment.count({ where }),
    ]);

    const likedIds = await prisma.momentLike
      .findMany({
        where: { userId: callerId, momentId: { in: items.map((m) => m.id) } },
        select: { momentId: true },
      })
      .then((rows) => new Set(rows.map((r) => r.momentId)));

    return {
      results: items.map((m) => formatMoment(m, likedIds.has(m.id))),
      count,
      page,
      page_size: pageSize,
    };
  },

  async listByUser(
    callerId: string,
    userId: string,
    page: number,
    pageSize: number,
  ) {
    const where = { userId };
    const [items, count] = await Promise.all([
      prisma.moment.findMany({
        where,
        include: { user: { select: userSelect } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.moment.count({ where }),
    ]);
    const likedIds = await prisma.momentLike
      .findMany({
        where: { userId: callerId, momentId: { in: items.map((m) => m.id) } },
        select: { momentId: true },
      })
      .then((rows) => new Set(rows.map((r) => r.momentId)));
    return {
      results: items.map((m) => formatMoment(m, likedIds.has(m.id))),
      count,
      page,
      page_size: pageSize,
    };
  },

  async countByUser(userId: string) {
    return prisma.moment.count({ where: { userId } });
  },

  async create(
    userId: string,
    data: {
      postType?: string;
      mediaUrl?: string;
      posterUrl?: string;
      caption?: string;
      hashtag?: string;
    },
  ) {
    const postType = data.postType ?? 'moment';
    if (postType === 'video' && !data.mediaUrl) {
      throw new AppError('Video posts require a video file', 400);
    }
    if (postType === 'moment' && !data.mediaUrl) {
      throw new AppError('Moment posts require an image', 400);
    }

    const moment = await prisma.moment.create({
      data: {
        userId,
        postType,
        mediaUrl: data.mediaUrl ?? null,
        posterUrl: data.posterUrl ?? null,
        caption: data.caption ?? '',
        hashtag: data.hashtag ?? '',
      },
      include: { user: { select: userSelect } },
    });
    return formatMoment(moment, false);
  },

  async get(callerId: string, id: string) {
    const moment = await prisma.moment.findUnique({
      where: { id },
      include: { user: { select: userSelect } },
    });
    if (!moment) return null;
    const liked = await prisma.momentLike.findUnique({
      where: { momentId_userId: { momentId: id, userId: callerId } },
    });
    return formatMoment(moment, !!liked);
  },

  async delete(userId: string, id: string) {
    const moment = await prisma.moment.findUnique({ where: { id } });
    if (!moment || moment.userId !== userId) return false;
    await prisma.moment.delete({ where: { id } });
    return true;
  },

  async toggleLike(callerId: string, momentId: string) {
    const moment = await prisma.moment.findUnique({
      where: { id: momentId },
      select: { userId: true, postType: true },
    });
    if (!moment) throw new AppError('Moment not found', 404);

    const existing = await prisma.momentLike.findUnique({
      where: { momentId_userId: { momentId, userId: callerId } },
    });
    if (existing) {
      await prisma.momentLike.delete({
        where: { momentId_userId: { momentId, userId: callerId } },
      });
      const updated = await prisma.moment.update({
        where: { id: momentId },
        data: { likesCount: { decrement: 1 } },
      });
      return { liked: false, likes_count: Math.max(0, updated.likesCount) };
    } else {
      await prisma.momentLike.create({ data: { momentId, userId: callerId } });
      const updated = await prisma.moment.update({
        where: { id: momentId },
        data: { likesCount: { increment: 1 } },
      });
      void notifyMomentLiked(moment.userId, callerId, momentId, moment.postType);
      return { liked: true, likes_count: updated.likesCount };
    }
  },

  async getComments(callerId: string, momentId: string) {
    const comments = await prisma.momentComment.findMany({
      where: { momentId },
      include: { user: { select: userSelect } },
      orderBy: { createdAt: 'asc' },
    });
    const likedIds = await prisma.momentCommentLike
      .findMany({
        where: { userId: callerId, commentId: { in: comments.map((c) => c.id) } },
        select: { commentId: true },
      })
      .then((rows) => new Set(rows.map((r) => r.commentId)));

    return comments.map((c) => ({
      id: c.id,
      user: formatAuthor(c.user),
      text: c.text,
      likes_count: c.likesCount,
      is_liked: likedIds.has(c.id),
      created_at: c.createdAt.toISOString(),
    }));
  },

  async postComment(callerId: string, momentId: string, text: string) {
    const moment = await prisma.moment.findUnique({
      where: { id: momentId },
      select: { userId: true, postType: true },
    });
    if (!moment) throw new AppError('Moment not found', 404);

    const comment = await prisma.momentComment.create({
      data: { momentId, userId: callerId, text },
      include: { user: { select: userSelect } },
    });
    await prisma.moment.update({
      where: { id: momentId },
      data: { commentsCount: { increment: 1 } },
    });
    void notifyMomentCommented(moment.userId, callerId, momentId, moment.postType, text);
    return {
      id: comment.id,
      user: formatAuthor(comment.user),
      text: comment.text,
      likes_count: comment.likesCount,
      is_liked: false,
      created_at: comment.createdAt.toISOString(),
    };
  },

  async toggleCommentLike(callerId: string, commentId: string) {
    const comment = await prisma.momentComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new AppError('Comment not found', 404);

    const existing = await prisma.momentCommentLike.findUnique({
      where: { commentId_userId: { commentId, userId: callerId } },
    });
    if (existing) {
      await prisma.momentCommentLike.delete({
        where: { commentId_userId: { commentId, userId: callerId } },
      });
      const updated = await prisma.momentComment.update({
        where: { id: commentId },
        data: { likesCount: { decrement: 1 } },
      });
      return { liked: false, likes_count: Math.max(0, updated.likesCount) };
    }

    await prisma.momentCommentLike.create({ data: { commentId, userId: callerId } });
    const updated = await prisma.momentComment.update({
      where: { id: commentId },
      data: { likesCount: { increment: 1 } },
    });
    return { liked: true, likes_count: updated.likesCount };
  },

  async share(callerId: string, momentId: string) {
    const moment = await prisma.moment.findUnique({
      where: { id: momentId },
      select: { userId: true, postType: true },
    });
    if (!moment) throw new AppError('Moment not found', 404);

    const updated = await prisma.moment.update({
      where: { id: momentId },
      data: { sharesCount: { increment: 1 } },
    });
    void notifyMomentShared(moment.userId, callerId, momentId, moment.postType);
    return { shares_count: updated.sharesCount };
  },

  async sendGift(callerId: string, momentId: string, giftId: string) {
    const moment = await prisma.moment.findUnique({ where: { id: momentId } });
    if (!moment) throw new AppError('Moment not found', 404);
    if (moment.userId === callerId) {
      throw new AppError('Cannot send a gift to your own post', 400);
    }

    const gift = await prisma.gift.findUnique({ where: { id: giftId } });
    if (!gift) throw new AppError('Gift not found', 404);
    const wallet = await prisma.wallet.findUnique({ where: { userId: callerId } });
    if (!wallet || wallet.coinBalance < gift.coinCost)
      throw new AppError('Insufficient coins', 400);

    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId: callerId },
        data: { coinBalance: { decrement: gift.coinCost } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: 'debit',
          currency: 'coins',
          amount: gift.coinCost,
          balanceAfter: Number(wallet.coinBalance) - gift.coinCost,
          reference: 'gift_sent',
          description: `Gift ${gift.name} on moment ${momentId}`,
        },
      });
    });

    await prisma.moment.update({
      where: { id: momentId },
      data: { giftsCount: { increment: 1 } },
    });

    void notifyMomentGifted(moment.userId, callerId, momentId, moment.postType, gift.name);

    return { gift_name: gift.name, coin_cost: gift.coinCost };
  },
};
