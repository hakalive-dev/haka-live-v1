import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ok } from '../../utils/response';

/**
 * Agora Notification Callback Service (NCS) events.
 *
 * Agora posts to this webhook when channel lifecycle events occur.
 * See: https://docs.agora.io/en/video-calling/develop/receive-notifications
 *
 * Event types we handle:
 *  - 101: channel created (broadcaster joins empty channel)
 *  - 102: channel destroyed (last user left)
 *  - 103: broadcaster joins channel
 *  - 104: broadcaster leaves channel
 *  - 105: audience joins channel
 *  - 106: audience leaves channel
 *
 * Request body shape (per Agora docs):
 * {
 *   noticeId: string,
 *   productId: number,
 *   eventType: number,
 *   payload: {
 *     channelName: string,
 *     uid: number,
 *     ts: number,
 *     ...
 *   }
 * }
 */

interface AgoraNcsPayload {
  channelName: string;
  uid: number;
  ts: number;
}

interface AgoraNcsBody {
  noticeId: string;
  productId: number;
  eventType: number;
  payload: AgoraNcsPayload;
}

export async function handleAgoraWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    // Verify Agora NCS signature when AGORA_NCS_SECRET is configured.
    // Agora sends HMAC-SHA256(secret, rawBody) in the Agora-Signature header.
    if (env.AGORA_NCS_SECRET) {
      const sig = req.headers['agora-signature'] as string | undefined;
      const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
      const expected = crypto
        .createHmac('sha256', env.AGORA_NCS_SECRET)
        .update(rawBody)
        .digest('hex');
      if (!sig || sig !== expected) {
        res.status(401).json({ error: 'Invalid Agora webhook signature' });
        return;
      }
    }

    const { eventType, payload } = req.body as AgoraNcsBody;
    const { channelName } = payload;

    switch (eventType) {
      case 102: {
        // Channel destroyed — all users have left.
        // If room is still "live", update viewer count to 0.
        await prisma.room.updateMany({
          where: { agoraChannel: channelName, status: 'live' },
          data: { viewerCount: 0 },
        });
        break;
      }

      case 103:
      case 105: {
        // User joined — increment viewer count.
        await prisma.room.updateMany({
          where: { agoraChannel: channelName, status: 'live' },
          data: { viewerCount: { increment: 1 } },
        });
        break;
      }

      case 104:
      case 106: {
        // User left — decrement viewer count (floor at 0).
        const room = await prisma.room.findFirst({
          where: { agoraChannel: channelName, status: 'live' },
        });
        if (room && room.viewerCount > 0) {
          await prisma.room.update({
            where: { id: room.id },
            data: { viewerCount: { decrement: 1 } },
          });
        }
        break;
      }

      default:
        // 101 (channel created) and others — no action needed.
        break;
    }

    // Agora expects a 200 response to acknowledge the webhook.
    ok(res, null);
  } catch (err) { next(err); }
}
