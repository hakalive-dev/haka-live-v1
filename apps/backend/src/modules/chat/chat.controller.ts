import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as chatService from './chat.service';
import { notifyDmRecipient, notifyRoomChatRecipients } from './chat.push';
import * as callService from './call.service';
import { deriveCallChannelName } from './call-channel';
import { ok, created } from '../../utils/response';
import { getIO } from '../../sockets';
import { AppError } from '../../middleware/error.middleware';
import { MAX_GIFT_SEND_QTY } from '../../shared-types/gifts';
import { assertNoRiskBlock } from '../../utils/risk-control';
import { assertCannotReplyToSystemDm } from './haka-team-guard';
import * as teamAnnouncementService from './team-announcement.service';

// ── Validation ───────────────────────────────────────────────────────────────

const sendRoomMsgSchema = z.object({
  content: z.string().min(1).max(500),
});

const sendRoomImageSchema = z.object({
  caption: z.string().max(500).optional(),
});

const sendDMImageSchema = z.object({
  caption: z.string().max(500).optional(),
});

const sendDMSchema = z.object({
  content: z.string().min(1).max(2000),
});

const sendGiftDMSchema = z.object({
  giftId: z.string().uuid(),
  qty: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_GIFT_SEND_QTY, {
      message: `Quantity must be between 1 and ${MAX_GIFT_SEND_QTY}`,
    })
    .default(1),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const markTeamReadSchema = z.object({
  announcementId: z.string().uuid(),
});

const deleteDMSchema = z.object({
  mode: z.enum(['for_me', 'for_everyone']),
});

const forwardDMSchema = z.object({
  recipientId: z.string().uuid(),
});

// ── Controllers ──────────────────────────────────────────────────────────────

const cursorSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
});

/** GET /chat/rooms/:roomId/messages?cursor=&limit=50 */
export async function getRoomMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const { cursor, limit } = cursorSchema.parse(req.query);
    const data = await chatService.getRoomMessages(req.params.roomId, req.user!.id, cursor, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /chat/rooms/:roomId/messages */
export async function sendRoomMessage(req: Request, res: Response, next: NextFunction) {
  try {
    await assertNoRiskBlock(req.user!.id, 'blockChat');
    const { content } = sendRoomMsgSchema.parse(req.body);
    const msg = await chatService.sendRoomMessage(req.user!.id, req.params.roomId, content);

    // Broadcast to room via Socket.io
    try {
      getIO().to(req.params.roomId).emit('message.sent', msg);
    } catch {}

    void notifyRoomChatRecipients({
      io: getIO(),
      roomId: req.params.roomId,
      senderId: req.user!.id,
      preview: msg.content ?? '',
      isImage: false,
    }).catch(() => {});

    created(res, msg);
  } catch (err) { next(err); }
}

/** POST /chat/rooms/:roomId/images — multipart: file (image), caption (optional) */
export async function sendRoomImage(req: Request, res: Response, next: NextFunction) {
  try {
    await assertNoRiskBlock(req.user!.id, 'blockChat');
    if (!req.file) {
      throw new AppError('Image file is required', 400);
    }
    const { caption } = sendRoomImageSchema.parse(req.body);

    // Derive base URL from the request so the local-disk fallback URL is
    // always reachable by the client (avoids stale API_BASE_URL env var).
    const requestBaseUrl = `${req.protocol}://${req.get('x-forwarded-host') ?? req.get('host')}`;
    const msg = await chatService.sendRoomImageMessage(
      req.user!.id,
      req.params.roomId,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      caption,
      requestBaseUrl,
    );

    try {
      getIO().to(req.params.roomId).emit('message.sent', msg);
    } catch {}

    void notifyRoomChatRecipients({
      io: getIO(),
      roomId: req.params.roomId,
      senderId: req.user!.id,
      preview: msg.content ?? 'Photo',
      isImage: true,
    }).catch(() => {});

    created(res, msg);
  } catch (err) { next(err); }
}

/** GET /chat/team-announcement */
export async function getTeamAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await teamAnnouncementService.getLatestTeamAnnouncementForUser(req.user!.id);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** POST /chat/team-announcement/read */
export async function markTeamAnnouncementRead(req: Request, res: Response, next: NextFunction) {
  try {
    const { announcementId } = markTeamReadSchema.parse(req.body);
    const data = await teamAnnouncementService.markTeamAnnouncementRead(req.user!.id, announcementId);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /chat/messages-badge */
export async function getMessagesBadge(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await chatService.getMessagesBadgeCount(req.user!.id);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /chat/conversations */
export async function getConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await chatService.getConversations(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /chat/conversations/friends */
export async function getFriendConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await chatService.getFriendConversations(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /chat/conversations/:userId/messages */
export async function getMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await chatService.getMessages(req.user!.id, req.params.userId, page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /chat/conversations/:userId/messages */
export async function sendDM(req: Request, res: Response, next: NextFunction) {
  try {
    await assertNoRiskBlock(req.user!.id, 'blockChat');
    const { content } = sendDMSchema.parse(req.body);
    const dm = await chatService.sendDM(req.user!.id, req.params.userId, content);

    // Emit real-time event to recipient via Socket.io
    try {
      getIO().to(`user:${req.params.userId}`).emit('new_dm', dm);
    } catch {}

    void notifyDmRecipient({
      recipientId: req.params.userId,
      senderId: req.user!.id,
      preview: dm.content,
      messageType: dm.messageType ?? 'text',
    }).catch(() => {});

    created(res, dm);
  } catch (err) { next(err); }
}

/** POST /chat/conversations/:userId/images — multipart: file (image), caption (optional) */
export async function sendDMImage(req: Request, res: Response, next: NextFunction) {
  try {
    await assertNoRiskBlock(req.user!.id, 'blockChat');
    if (!req.file) {
      throw new AppError('Image file is required', 400);
    }
    const { caption } = sendDMImageSchema.parse(req.body);

    const requestBaseUrl = `${req.protocol}://${req.get('x-forwarded-host') ?? req.get('host')}`;
    const dm = await chatService.sendDMImageMessage(
      req.user!.id,
      req.params.userId,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      caption,
      requestBaseUrl,
    );

    try {
      getIO().to(`user:${req.params.userId}`).emit('new_dm', dm);
    } catch {}

    void notifyDmRecipient({
      recipientId: req.params.userId,
      senderId: req.user!.id,
      preview: dm.content || 'Photo',
      messageType: 'image',
    }).catch(() => {});

    created(res, dm);
  } catch (err) { next(err); }
}

/** POST /chat/conversations/:userId/gift */
export async function sendGiftDM(req: Request, res: Response, next: NextFunction) {
  try {
    await assertNoRiskBlock(req.user!.id, 'freezeCoins', 'disableGifts', 'blockChat');
    const { giftId, qty } = sendGiftDMSchema.parse(req.body);
    const dm = await chatService.sendGiftDM(req.user!.id, req.params.userId, giftId, qty);
    try {
      getIO().to(`user:${req.params.userId}`).emit('new_dm', dm);
    } catch {}

    void notifyDmRecipient({
      recipientId: req.params.userId,
      senderId: req.user!.id,
      preview: dm.content,
      messageType: 'gift',
    }).catch(() => {});

    created(res, dm);
  } catch (err) { next(err); }
}

/** POST /chat/conversations/:userId/read */
export async function markAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await chatService.markAsRead(req.user!.id, req.params.userId);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /chat/friends/online */
export async function getOnlineFriends(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await chatService.getOnlineFriends(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /chat/conversations/:userId/call-token — Agora RTC token for 1:1 video call */
export async function getCallToken(req: Request, res: Response, next: NextFunction) {
  try {
    const myId    = req.user!.id;
    const otherId = req.params.userId;
    assertCannotReplyToSystemDm(otherId);
    const channel = deriveCallChannelName(myId, otherId);
    const { generateRtcToken, getOrAssignUid } = await import('../rooms/agora.service');
    const uid    = await getOrAssignUid(myId, channel);
    const result = generateRtcToken(channel, uid, 'publisher');
    ok(res, result);
  } catch (err) { next(err); }
}

/** POST /chat/conversations/:userId/call-invite — ring + socket signal for 1:1 voice/video */
export async function postCallInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const callType = req.body?.callType === 'voice' ? 'voice' : 'video';
    const result = await callService.startCall(req.user!.id, req.params.userId, callType);
    ok(
      res,
      { signaled: result.status === 'ringing', ...result },
      result.status === 'busy' ? 'User is on another call' : 'Call invite sent',
    );
  } catch (err) { next(err); }
}

/** POST /chat/conversations/:userId/call-answer — callee accepts; 410 if call already settled */
export async function postCallAnswer(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await callService.answerCall(req.user!.id, req.params.userId);
    ok(res, { answered: true, ...result }, 'Call answered');
  } catch (err) { next(err); }
}

/** POST /chat/conversations/:userId/call-decline — callee rejects incoming call */
export async function postCallDecline(req: Request, res: Response, next: NextFunction) {
  try {
    await callService.declineCall(req.user!.id, req.params.userId);
    ok(res, { declined: true }, 'Call declined');
  } catch (err) { next(err); }
}

/** POST /chat/conversations/:userId/call-end — either party ends the call */
export async function postCallEnd(req: Request, res: Response, next: NextFunction) {
  try {
    await callService.endCall(req.user!.id, req.params.userId);
    ok(res, { ended: true }, 'Call ended');
  } catch (err) { next(err); }
}

/** POST /chat/conversations/:userId/call-cancel — caller aborts before callee answers */
export async function postCallCancel(req: Request, res: Response, next: NextFunction) {
  try {
    await callService.cancelCall(req.user!.id, req.params.userId);
    ok(res, { cancelled: true }, 'Call cancelled');
  } catch (err) { next(err); }
}

/** DELETE /chat/conversations/messages/:messageId */
export async function deleteDMMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { mode } = deleteDMSchema.parse(req.body);
    const result = await chatService.deleteDirectMessage(req.user!.id, req.params.messageId, mode);

    if (mode === 'for_everyone' && 'isDeleted' in result && result.isDeleted) {
      try {
        const payload = {
          messageId: result.id,
          deletedForAllAt: result.deletedForAllAt,
        };
        getIO()
          .to(`user:${result.sender.id}`)
          .to(`user:${result.recipient.id}`)
          .emit('dm:deleted', payload);
      } catch {}
    }

    ok(res, result);
  } catch (err) { next(err); }
}

/** POST /chat/conversations/messages/:messageId/forward */
export async function forwardDMMessage(req: Request, res: Response, next: NextFunction) {
  try {
    await assertNoRiskBlock(req.user!.id, 'blockChat');
    const { recipientId } = forwardDMSchema.parse(req.body);
    const dm = await chatService.forwardDirectMessage(req.user!.id, req.params.messageId, recipientId);

    try {
      getIO().to(`user:${recipientId}`).emit('new_dm', dm);
    } catch {}

    void notifyDmRecipient({
      recipientId,
      senderId: req.user!.id,
      preview: dm.content || (dm.messageType === 'image' ? 'Photo' : dm.content),
      messageType: dm.messageType ?? 'text',
    }).catch(() => {});

    created(res, dm);
  } catch (err) { next(err); }
}
