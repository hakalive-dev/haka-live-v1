import { prisma } from '../../config/prisma';
import { supabase } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';
import { getIO } from '../../sockets';
import { userSummarySelect, serializeUserSummary } from '../users/user-summary';
import { isVisibleOnlineToViewer } from '../users/presence';
import { resolvePublicAssetUrl, uploadToStorage } from '../../utils/storage';
import { storageFilename } from '../../utils/upload';
import { notifyDmRecipient } from './chat.push';
import { assertCannotReplyToSystemDm } from './haka-team-guard';
import { getHakaTeamUserId } from '../../constants/haka-team';
import { getWithdrawalMessageUserId } from '../../constants/withdrawal-message';
import {
  effectiveRoomChatSince,
  getOrCreateUserRoomChatSince,
} from './room-chat-session';

export { clearUserRoomChatSession } from './room-chat-session';

// ── Room Messages ───────────────────────────────────────────────────────────

export function roomMessageSelect() {
  return {
    id: true,
    content: true,
    type: true,
    mediaUrl: true,
    createdAt: true,
    sender: { select: userSummarySelect() },
  };
}

type RawRoomMessage = {
  id: string;
  content: string | null;
  type: string;
  mediaUrl: string | null;
  createdAt: Date;
  sender: Parameters<typeof serializeUserSummary>[0] | null;
};

export function serializeRoomMessage(msg: RawRoomMessage) {
  return {
    ...msg,
    mediaUrl: msg.mediaUrl ? resolvePublicAssetUrl(msg.mediaUrl) : msg.mediaUrl,
    sender: msg.sender ? serializeUserSummary(msg.sender) : null,
  };
}

/**
 * Send a message in a room (persisted).
 */
export type RoomMessageType = 'text' | 'quick' | 'gift_notice' | 'system' | 'image';

export async function sendRoomMessage(
  senderId: string,
  roomId: string,
  content: string,
  type: RoomMessageType = 'text',
) {
  if (!content || content.trim().length === 0) {
    throw new AppError('Message cannot be empty');
  }
  if (content.length > 500) {
    throw new AppError('Message too long (max 500 chars)');
  }

  // Skip mute check for system-generated messages (gift notices etc).
  if (type !== 'system' && type !== 'gift_notice') {
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { isMuted: true },
    });
    if (sender?.isMuted) throw new AppError('You are muted', 403);
  }

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, status: true } });
  if (!room) throw new AppError('Room not found', 404);
  if (room.status === 'ended') throw new AppError('Room has ended', 400);

  const msg = await prisma.roomMessage.create({
    data: {
      roomId,
      senderId,
      content: content.trim(),
      type,
    },
    select: roomMessageSelect(),
  });

  return serializeRoomMessage(msg);
}

/**
 * Upload an image buffer and persist a room message of type='image'.
 * Caller handles multipart parsing and MIME/size validation.
 */
export async function sendRoomImageMessage(
  senderId: string,
  roomId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  caption?: string,
  requestBaseUrl?: string,
) {
  if (caption && caption.length > 500) {
    throw new AppError('Message too long (max 500 chars)');
  }

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { isMuted: true },
  });
  if (sender?.isMuted) throw new AppError('You are muted', 403);

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, status: true } });
  if (!room) throw new AppError('Room not found', 404);
  if (room.status === 'ended') throw new AppError('Room has ended', 400);

  const objectKey = `rooms/${roomId}/${storageFilename(originalName)}`;
  const publicUrl = await uploadToStorage(buffer, objectKey, mimeType, 'room-chat-images', requestBaseUrl, {
    resize: { maxDim: 1280, format: 'jpeg', quality: 78 },
    cacheControl: '31536000',
    immutable: true,
  });

  let msg;
  try {
    msg = await prisma.roomMessage.create({
      data: {
        roomId,
        senderId,
        content: caption?.trim() || null,
        type: 'image',
        mediaUrl: publicUrl,
      },
      select: roomMessageSelect(),
    });
  } catch (err) {
    // DB insert failed after upload succeeded — best-effort cleanup so we
    // don't leave an orphaned object in the bucket.
    if (supabase) {
      try { await supabase.storage.from('room-chat-images').remove([objectKey]); } catch {}
    }
    throw err;
  }

  return serializeRoomMessage(msg);
}

/**
 * System-originated message (e.g. gift notices) — no sender user validation.
 * Callers are trusted (internal modules like gifts).
 */
export async function sendSystemMessage(
  roomId: string,
  senderId: string | null,
  content: string,
  type: Exclude<RoomMessageType, 'text'> = 'system',
) {
  try {
    const msg = await prisma.roomMessage.create({
      data: { roomId, senderId, content, type },
      select: roomMessageSelect(),
    });
    return serializeRoomMessage(msg);
  } catch (err: any) {
    // FK constraint violation means room or sender no longer exists
    if (err?.code === 'P2003' || err?.code === 'P2025') {
      throw new AppError('Room or sender not found', 404);
    }
    throw err;
  }
}

/**
 * Get recent messages for a room, cursor-paginated (newest first).
 * `cursor` is a message id — returns messages older than that cursor.
 */
export async function getRoomMessages(roomId: string, userId: string, cursor?: string, limit = 50) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, chatClearedAt: true } });
  if (!room) throw new AppError('Room not found', 404);

  const userSince = await getOrCreateUserRoomChatSince(roomId, userId);
  const since = effectiveRoomChatSince(room.chatClearedAt, userSince);

  const take = Math.min(Math.max(limit, 1), 100);

  const messages = await prisma.roomMessage.findMany({
    where: {
      roomId,
      createdAt: { gt: since },
    },
    select: roomMessageSelect(),
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = messages.length > take;
  const items = (hasMore ? messages.slice(0, take) : messages).map(serializeRoomMessage);
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return { items, nextCursor, hasMore };
}

// ── Direct Messages ─────────────────────────────────────────────────────────

function dmSelect() {
  return {
    id: true,
    content: true,
    isRead: true,
    createdAt: true,
    messageType: true,
    mediaUrl: true,
    giftId: true,
    giftName: true,
    giftImage: true,
    giftIcon: true,
    giftQty: true,
    giftCoinCost: true,
    deletedForAllAt: true,
    sender: { select: userSummarySelect() },
    recipient: { select: userSummarySelect() },
  };
}

type RawDM = {
  id: string;
  content: string;
  isRead: boolean;
  createdAt: Date;
  messageType: string;
  mediaUrl: string | null;
  giftId: string | null;
  giftName: string;
  giftImage: string;
  giftIcon: string;
  giftQty: number;
  giftCoinCost: number;
  deletedForAllAt: Date | null;
  sender: Parameters<typeof serializeUserSummary>[0];
  recipient: Parameters<typeof serializeUserSummary>[0];
};

function serializeDM(dm: RawDM) {
  const isDeleted = dm.deletedForAllAt != null;
  return {
    ...dm,
    content: isDeleted ? '' : dm.content,
    mediaUrl: isDeleted ? null : (dm.mediaUrl ? resolvePublicAssetUrl(dm.mediaUrl) : dm.mediaUrl),
    isDeleted,
    sender: serializeUserSummary(dm.sender),
    recipient: serializeUserSummary(dm.recipient),
  };
}

const FORWARDABLE_DM_TYPES = new Set(['text', 'image', 'gift']);

function dmVisibleWhere(currentUserId: string, otherUserId: string) {
  return {
    OR: [
      { senderId: currentUserId, recipientId: otherUserId },
      { senderId: otherUserId, recipientId: currentUserId },
    ],
    hiddenFor: { none: { userId: currentUserId } },
  };
}

/**
 * Send a direct message to another user.
 */
export async function sendDM(senderId: string, recipientId: string, content: string) {
  assertCannotReplyToSystemDm(recipientId);
  if (!content || content.trim().length === 0) {
    throw new AppError('Message cannot be empty');
  }
  if (content.length > 2000) {
    throw new AppError('Message too long (max 2000 chars)');
  }
  if (senderId === recipientId) {
    throw new AppError('Cannot send a message to yourself');
  }

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { isMuted: true },
  });
  if (sender?.isMuted) throw new AppError('You are muted', 403);

  // Verify recipient exists
  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true } });
  if (!recipient) {
    throw new AppError('Recipient not found', 404);
  }

  // Blocklist: either direction blocks DMs.
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { actorId: senderId, targetId: recipientId },
        { actorId: recipientId, targetId: senderId },
      ],
    },
    select: { id: true },
  });
  if (block) {
    throw new AppError('You cannot message this user', 403);
  }

  // Enforce recipient's who_can_message privilege.
  const prefs = await prisma.userSettings.findUnique({
    where: { userId: recipientId },
    select: { whoCanMessage: true },
  });
  const whoCan = prefs?.whoCanMessage ?? 'everyone';
  if (whoCan !== 'everyone') {
    // `following` — recipient must follow the sender (sender is in recipient's following list).
    // `mutual`    — both follow each other.
    const recipientFollowsSender = await prisma.follow.findFirst({
      where: { actorId: recipientId, targetId: senderId },
      select: { id: true },
    });
    if (!recipientFollowsSender) {
      throw new AppError('This user only accepts messages from people they follow', 403);
    }
    if (whoCan === 'mutual') {
      const senderFollowsRecipient = await prisma.follow.findFirst({
        where: { actorId: senderId, targetId: recipientId },
        select: { id: true },
      });
      if (!senderFollowsRecipient) {
        throw new AppError('This user only accepts messages from mutual follows', 403);
      }
    }
  }

  const dm = await prisma.directMessage.create({
    data: {
      senderId,
      recipientId,
      content: content.trim(),
    },
    select: dmSelect(),
  });

  return serializeDM(dm);
}

/**
 * Upload an image buffer and persist a DM of messageType='image'.
 * Caller handles multipart parsing and MIME/size validation.
 * Enforces the same block/privacy rules as a text DM.
 */
export async function sendDMImageMessage(
  senderId: string,
  recipientId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  caption?: string,
  requestBaseUrl?: string,
) {
  assertCannotReplyToSystemDm(recipientId);
  if (senderId === recipientId) {
    throw new AppError('Cannot send a message to yourself');
  }
  if (caption && caption.length > 500) {
    throw new AppError('Caption too long (max 500 chars)');
  }

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { isMuted: true },
  });
  if (sender?.isMuted) throw new AppError('You are muted', 403);

  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true },
  });
  if (!recipient) throw new AppError('Recipient not found', 404);

  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { actorId: senderId, targetId: recipientId },
        { actorId: recipientId, targetId: senderId },
      ],
    },
    select: { id: true },
  });
  if (block) throw new AppError('You cannot message this user', 403);

  const prefs = await prisma.userSettings.findUnique({
    where: { userId: recipientId },
    select: { whoCanMessage: true },
  });
  const whoCan = prefs?.whoCanMessage ?? 'everyone';
  if (whoCan !== 'everyone') {
    const recipientFollowsSender = await prisma.follow.findFirst({
      where: { actorId: recipientId, targetId: senderId },
      select: { id: true },
    });
    if (!recipientFollowsSender) {
      throw new AppError('This user only accepts messages from people they follow', 403);
    }
    if (whoCan === 'mutual') {
      const senderFollowsRecipient = await prisma.follow.findFirst({
        where: { actorId: senderId, targetId: recipientId },
        select: { id: true },
      });
      if (!senderFollowsRecipient) {
        throw new AppError('This user only accepts messages from mutual follows', 403);
      }
    }
  }

  const pair = [senderId, recipientId].sort().join('-');
  const objectKey = `dms/${pair}/${storageFilename(originalName)}`;
  const publicUrl = await uploadToStorage(buffer, objectKey, mimeType, 'dm-chat-images', requestBaseUrl, {
    resize: { maxDim: 1280, format: 'jpeg', quality: 78 },
    cacheControl: '31536000',
    immutable: true,
  });

  let dm;
  try {
    dm = await prisma.directMessage.create({
      data: {
        senderId,
        recipientId,
        content: caption?.trim() ?? '',
        messageType: 'image',
        mediaUrl: publicUrl,
      },
      select: dmSelect(),
    });
  } catch (err) {
    if (supabase) {
      try { await supabase.storage.from('dm-chat-images').remove([objectKey]); } catch {}
    }
    throw err;
  }

  return serializeDM(dm);
}

/**
 * Server-initiated DM (agency onboarding / invites). Skips block list and recipient DM privacy rules.
 * Emits `new_dm` and runs the same push + in-app notification path as user DMs.
 */
export async function insertServerDirectMessage(opts: {
  senderId: string;
  recipientId: string;
  content: string;
  messageType: string;
  /**
   * When true, skip the recipient push/notification fan-out (`notifyDmRecipient`).
   * Used when this DM accompanies a separate `createNotification` for the same event,
   * so the user isn't notified twice. The DM row + `new_dm` socket event are still sent.
   */
  skipRecipientNotify?: boolean;
}) {
  const { senderId, recipientId, content, messageType, skipRecipientNotify } = opts;
  const trimmed = content.trim();
  if (!trimmed) throw new AppError('Message cannot be empty');
  if (trimmed.length > 2000) throw new AppError('Message too long (max 2000 chars)');
  if (senderId === recipientId) throw new AppError('Cannot send a message to yourself');

  const dm = await prisma.directMessage.create({
    data: {
      senderId,
      recipientId,
      content: trimmed,
      messageType,
    },
    select: dmSelect(),
  });

  const serialized = serializeDM(dm);
  try {
    getIO().to(`user:${recipientId}`).emit('new_dm', serialized);
  } catch {
    /* Socket.io not initialized (tests) */
  }

  if (!skipRecipientNotify) {
    void notifyDmRecipient({
      recipientId,
      senderId,
      preview: trimmed,
      messageType,
    }).catch(() => {});
  }

  return serialized;
}

/**
 * Send a gift as a DM — calls gifts service for bean/XP distribution, then creates a DM record of type=gift.
 */
export async function sendGiftDM(
  senderId: string,
  recipientId: string,
  giftId: string,
  qty: number,
) {
  assertCannotReplyToSystemDm(recipientId);
  // Delegate to the canonical gift flow — handles coins, beans, XP, leaderboards atomically.
  const { sendGift } = await import('../gifts/gifts.service');
  const giftTx = await sendGift({ senderId, recipientId, giftId, qty });

  const dm = await prisma.directMessage.create({
    data: {
      senderId,
      recipientId,
      content: `${giftTx.gift.name} x${qty}`,
      messageType: 'gift',
      giftId: giftTx.gift.id,
      giftName: giftTx.gift.name,
      giftImage: giftTx.gift.image ?? '',
      giftIcon: giftTx.gift.icon ?? '',
      giftQty: qty,
      giftCoinCost: giftTx.coinCost,
    },
    select: dmSelect(),
  });

  return serializeDM(dm);
}

/**
 * Get paginated DM messages between two users.
 */
export async function getMessages(currentUserId: string, otherUserId: string, page: number, limit: number) {
  const where = dmVisibleWhere(currentUserId, otherUserId);

  const [items, total] = await Promise.all([
    prisma.directMessage.findMany({
      where,
      select: dmSelect(),
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.directMessage.count({ where }),
  ]);

  return {
    items: items.map(serializeDM),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

export type DeleteDirectMessageMode = 'for_me' | 'for_everyone';

/**
 * Delete a DM — hide for the acting user, or tombstone for both participants.
 */
export async function deleteDirectMessage(
  actorId: string,
  messageId: string,
  mode: DeleteDirectMessageMode,
) {
  const dm = await prisma.directMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      deletedForAllAt: true,
    },
  });
  if (!dm) throw new AppError('Message not found', 404);
  if (dm.senderId !== actorId && dm.recipientId !== actorId) {
    throw new AppError('Forbidden', 403);
  }

  if (mode === 'for_everyone') {
    if (dm.senderId !== actorId) {
      throw new AppError('Only the sender can delete for everyone', 403);
    }
    if (dm.deletedForAllAt) {
      const existing = await prisma.directMessage.findUnique({
        where: { id: messageId },
        select: dmSelect(),
      });
      if (!existing) throw new AppError('Message not found', 404);
      return serializeDM(existing);
    }
    const updated = await prisma.directMessage.update({
      where: { id: messageId },
      data: { deletedForAllAt: new Date() },
      select: dmSelect(),
    });
    return serializeDM(updated);
  }

  await prisma.directMessageHidden.upsert({
    where: { messageId_userId: { messageId, userId: actorId } },
    create: { messageId, userId: actorId },
    update: {},
  });

  return { messageId, hidden: true as const };
}

/**
 * Forward an existing DM to another user (creates a new message; no forward metadata in v1).
 */
export async function forwardDirectMessage(
  actorId: string,
  messageId: string,
  recipientId: string,
) {
  assertCannotReplyToSystemDm(recipientId);
  if (actorId === recipientId) {
    throw new AppError('Cannot forward a message to yourself');
  }

  const source = await prisma.directMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      content: true,
      messageType: true,
      mediaUrl: true,
      giftId: true,
      giftName: true,
      giftImage: true,
      giftIcon: true,
      giftQty: true,
      giftCoinCost: true,
      deletedForAllAt: true,
      hiddenFor: { where: { userId: actorId }, select: { id: true } },
    },
  });
  if (!source) throw new AppError('Message not found', 404);
  if (source.senderId !== actorId && source.recipientId !== actorId) {
    throw new AppError('Forbidden', 403);
  }
  if (source.deletedForAllAt || source.hiddenFor.length > 0) {
    throw new AppError('Message is no longer available', 400);
  }
  if (!FORWARDABLE_DM_TYPES.has(source.messageType)) {
    throw new AppError('This message type cannot be forwarded', 400);
  }

  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true } });
  if (!recipient) throw new AppError('Recipient not found', 404);

  const sender = await prisma.user.findUnique({
    where: { id: actorId },
    select: { isMuted: true },
  });
  if (sender?.isMuted) throw new AppError('You are muted', 403);

  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { actorId, targetId: recipientId },
        { actorId: recipientId, targetId: actorId },
      ],
    },
    select: { id: true },
  });
  if (block) throw new AppError('You cannot message this user', 403);

  const dm = await prisma.directMessage.create({
    data: {
      senderId: actorId,
      recipientId,
      content: source.content,
      messageType: source.messageType,
      mediaUrl: source.mediaUrl,
      giftId: source.giftId,
      giftName: source.giftName,
      giftImage: source.giftImage,
      giftIcon: source.giftIcon,
      giftQty: source.giftQty,
      giftCoinCost: source.giftCoinCost,
    },
    select: dmSelect(),
  });

  return serializeDM(dm);
}

async function resolveVisibleLastMessageId(userId: string, otherId: string): Promise<string | null> {
  const row = await prisma.directMessage.findFirst({
    where: dmVisibleWhere(userId, otherId),
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Get conversation list for a user (latest message per conversation partner).
 */
export async function getConversations(userId: string) {
  // Get all distinct conversation partners and their latest message
  // Using raw query for efficient "latest message per partner" aggregation
  const conversations = await prisma.$queryRaw<Array<{
    otherId: string;
    lastMessageId: string;
    unreadCount: bigint;
  }>>`
    WITH partners AS (
      SELECT DISTINCT
        CASE WHEN "senderId" = ${userId} THEN "recipientId" ELSE "senderId" END AS "otherId"
      FROM direct_messages
      WHERE "senderId" = ${userId} OR "recipientId" = ${userId}
    ),
    latest AS (
      SELECT DISTINCT ON (p."otherId")
        p."otherId",
        dm.id AS "lastMessageId"
      FROM partners p
      JOIN direct_messages dm
        ON (dm."senderId" = ${userId} AND dm."recipientId" = p."otherId")
        OR (dm."senderId" = p."otherId" AND dm."recipientId" = ${userId})
      ORDER BY p."otherId", dm."createdAt" DESC
    ),
    unreads AS (
      SELECT "senderId" AS "otherId", COUNT(*)::bigint AS "unreadCount"
      FROM direct_messages
      WHERE "recipientId" = ${userId} AND "isRead" = false
      GROUP BY "senderId"
    )
    SELECT l."otherId", l."lastMessageId", COALESCE(u."unreadCount", 0) AS "unreadCount"
    FROM latest l
    LEFT JOIN unreads u ON u."otherId" = l."otherId"
    ORDER BY (
      SELECT dm."createdAt" FROM direct_messages dm WHERE dm.id = l."lastMessageId"
    ) DESC
  `;

  // Fetch user info and last messages (skip DB bulk lookups when there are no DM rows yet —
  // we still attach Haka Team below so the inbox is never empty of that channel.)
  const otherIds = conversations.map(c => c.otherId);

  const [users, iFollowThem, theyFollowMe] =
    otherIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          prisma.user.findMany({
            where: { id: { in: otherIds } },
            select: {
              ...userSummarySelect(),
              settings: { select: { invisibleOnline: true } },
            },
          }),
          prisma.follow.findMany({
            where: { actorId: userId, targetId: { in: otherIds } },
            select: { targetId: true },
          }),
          prisma.follow.findMany({
            where: { targetId: userId, actorId: { in: otherIds } },
            select: { actorId: true },
          }),
        ]);

  const iFollowSet = new Set(iFollowThem.map(f => f.targetId));
  const theyFollowSet = new Set(theyFollowMe.map(f => f.actorId));
  const mutualSet = new Set([...iFollowSet].filter(id => theyFollowSet.has(id)));

  const invisibleMap = new Map(
    users.map((u) => [u.id, !!u.settings?.invisibleOnline]),
  );
  const userMap = new Map(users.map((u) => [u.id, serializeUserSummary(u)]));

  const rows = await Promise.all(
    conversations.map(async (c) => {
      const visibleId = await resolveVisibleLastMessageId(userId, c.otherId);
      let lastMessage = null;
      if (visibleId) {
        const fetched = await prisma.directMessage.findUnique({
          where: { id: visibleId },
          select: dmSelect(),
        });
        if (fetched) lastMessage = serializeDM(fetched);
      }

      return {
        otherUser: userMap.get(c.otherId) ?? null,
        lastMessage,
        unreadCount: Number(c.unreadCount),
        isFollowing: iFollowSet.has(c.otherId),
        isFamiliar: mutualSet.has(c.otherId),
        isOnline: isVisibleOnlineToViewer(
          c.otherId,
          userId,
          invisibleMap.get(c.otherId) ?? false,
        ),
      };
    }),
  );

  // Always surface Haka Team in the inbox so users can open one-way notices before any DM exists.
  const hakaTeamId = getHakaTeamUserId();
  const alreadyHasHaka = rows.some(r => r.otherUser?.id === hakaTeamId);
  if (!alreadyHasHaka) {
    const hakaUser = await prisma.user.findUnique({
      where: { id: hakaTeamId },
      select: userSummarySelect(),
    });
    if (hakaUser) {
      rows.unshift({
        otherUser: serializeUserSummary(hakaUser),
        lastMessage: null,
        unreadCount: 0,
        isFollowing: false,
        isFamiliar: false,
        isOnline: false,
      });
    }
  }

  const withdrawalCount = await prisma.withdrawalRequest.count({ where: { userId } });
  if (withdrawalCount > 0) {
    const wmId = getWithdrawalMessageUserId();
    const alreadyHasWm = rows.some((r) => r.otherUser?.id === wmId);
    if (!alreadyHasWm) {
      const wmUser = await prisma.user.findUnique({
        where: { id: wmId },
        select: userSummarySelect(),
      });
      if (wmUser) {
        const hakaIdx = rows.findIndex((r) => r.otherUser?.id === hakaTeamId);
        const insertAt = hakaIdx >= 0 ? hakaIdx + 1 : 0;
        rows.splice(insertAt, 0, {
          otherUser: serializeUserSummary(wmUser),
          lastMessage: null,
          unreadCount: 0,
          isFollowing: false,
          isFamiliar: false,
          isOnline: false,
        });
      }
    }
  }

  return rows;
}

/**
 * Get conversations only with users the current user follows.
 */
export async function getFriendConversations(userId: string) {
  const all = await getConversations(userId);
  return all.filter(c => c.isFollowing);
}

/** Messages tab badge: unread DMs only. */
export async function getMessagesBadgeCount(userId: string) {
  const count = await prisma.directMessage.count({
    where: { recipientId: userId, isRead: false },
  });
  return { count };
}

/**
 * Mark all messages from otherUser to currentUser as read.
 */
export async function markAsRead(currentUserId: string, otherUserId: string) {
  const result = await prisma.directMessage.updateMany({
    where: {
      senderId: otherUserId,
      recipientId: currentUserId,
      isRead: false,
    },
    data: { isRead: true },
  });

  await prisma.notification.updateMany({
    where: {
      userId: currentUserId,
      isRead: false,
      type: { in: ['dm', 'coin_transfer'] },
      data: {
        path: ['senderId'],
        equals: otherUserId,
      },
    },
    data: { isRead: true },
  });

  return { markedRead: result.count };
}

/**
 * Online users in the follow graph: people you follow OR who follow you (socket presence).
 */
export async function getOnlineFriends(userId: string) {
  const [iFollow, theyFollow] = await Promise.all([
    prisma.follow.findMany({
      where: { actorId: userId },
      select: { targetId: true },
    }),
    prisma.follow.findMany({
      where: { targetId: userId },
      select: { actorId: true },
    }),
  ]);

  const candidateIds = [
    ...new Set([
      ...iFollow.map((f) => f.targetId),
      ...theyFollow.map((f) => f.actorId),
    ]),
  ];

  if (candidateIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: candidateIds } },
    select: {
      ...userSummarySelect(),
      settings: { select: { invisibleOnline: true } },
    },
    take: 50,
  });

  return users
    .filter((u) =>
      isVisibleOnlineToViewer(u.id, userId, !!u.settings?.invisibleOnline),
    )
    .map((u) => ({
      ...serializeUserSummary(u),
      isOnline: true,
    }));
}
