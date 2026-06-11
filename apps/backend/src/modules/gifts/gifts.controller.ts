import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as giftsService from './gifts.service';
import { prisma } from '../../config/prisma';
import { ok, created } from '../../utils/response';
import { getIO } from '../../sockets';
import * as pkService from '../pk/pk.service';
import { PK_EVENTS } from '../../shared-types';
import * as normalBattleService from '../normal-battle/normal-battle.service';
import { BATTLE_EVENTS } from '../../shared-types';
import * as calcService from '../rooms/calculator.service';
import { redis } from '../../config/redis';
import * as luckyGiftsService from '../lucky-gifts/lucky-gifts.service';

const sendGiftSchema = z
  .object({
    giftId: z.string().min(1),
    recipientId: z.string().min(1).optional(),
    recipientAgencyId: z.string().min(1).optional(),
    roomId: z.string().min(1).optional(),
    qty: z.number().int().min(1).max(999).default(1),
  })
  .refine(
    (v) => !!v.recipientId !== !!v.recipientAgencyId,
    { message: 'Provide exactly one of recipientId or recipientAgencyId' },
  );

type SendGiftBody = z.infer<typeof sendGiftSchema>;

/**
 * Broadcast the gift animation to the room BEFORE coins are deducted.
 *
 * Called via `sendGift`'s `onAnimationReady` callback the moment the gift is
 * validated and the sender's balance is confirmed — so room viewers see the
 * animation immediately instead of waiting on the deduction + bean-distribution
 * transaction. Coins are still deducted atomically afterwards.
 */
function emitRoomGiftAnimation(
  senderId: string,
  giftId: string,
  anim: giftsService.GiftAnimationData,
) {
  void (async () => {
    try {
      const io = getIO();

      // Combo count and recipient seat both feed the payload but are independent —
      // run them concurrently so the animation broadcast fires one round-trip sooner.
      const [comboCount, recipientSeatPosition] = await Promise.all([
        giftsService
          .bumpCombo(anim.roomId, senderId, giftId, anim.recipientId, anim.qty)
          .catch(() => anim.qty),
        prisma.roomSeat
          .findFirst({
            where: { roomId: anim.roomId, userId: anim.recipientId },
            select: { position: true },
          })
          .then((s) => s?.position ?? null)
          .catch(() => null),
      ]);

      const giftEventPayload = {
        // Not yet persisted — animation does not need the tx id; mobile only
        // uses it for a non-critical chat-notice key (falls back to a timestamp).
        giftTxId: null,
        giftId: anim.gift.id,
        gift: anim.gift,
        sender: anim.sender,
        recipient: anim.recipient,
        senderId,
        senderName: anim.sender.displayName,
        senderAvatar: anim.sender.avatar,
        recipientId: anim.recipientId,
        recipientName: anim.recipient.displayName,
        qty: anim.qty,
        svgaKey: anim.gift.svgaAsset ?? '',
        soundKey: anim.gift.soundKey ?? '',
        comboCount,
        recipientSeatPosition,
        createdAt: new Date().toISOString(),
      };

      // Broadcast the animation FIRST so viewers see the gift immediately; the
      // replay buffer (for late joiners) is non-critical and can write afterward.
      io.to(anim.roomId).emit('gift:received', giftEventPayload);

      try {
        const streamKey = `room:{${anim.roomId}}:gift_events`;
        await redis.xadd(streamKey, '*', 'payload', JSON.stringify(giftEventPayload));
        await redis.xtrim(streamKey, 'MAXLEN', '~', 200);
        await redis.expire(streamKey, 60 * 60 * 6);
      } catch {
        /* non-critical replay buffer */
      }
    } catch (err) {
      console.error('[Gift] Failed to broadcast gift animation:', err);
    }
  })();
}

/**
 * Post-commit socket/redis side effects — run after the HTTP response so mobile
 * clients do not time out. The room animation is broadcast earlier (see
 * `emitRoomGiftAnimation`); this handles scoring + commission + host stats that
 * must only fire once coins are actually deducted.
 */
async function broadcastGiftSideEffects(
  body: SendGiftBody,
  senderId: string,
  giftTx: Awaited<ReturnType<typeof giftsService.sendGift>>,
) {
  try {
    const io = getIO();

    if (body.roomId) {
      pkService.getActiveMatchForRoom(body.roomId)
        .then(async (match) => {
          if (!match) return;
          const side = match.roomAId === body.roomId ? 'A' : 'B';
          const scores = await pkService.addScore(match.id, side, giftTx.coinCost);
          io.to(`pk:${match.id}`).emit(PK_EVENTS.SCORE_UPDATED, scores);
        })
        .catch(() => {});

      normalBattleService.getActiveBattle(body.roomId)
        .then(async (battle) => {
          if (!battle || battle.mode !== 'coins') return;
          let side: 'A' | 'B' | null = null;
          if (giftTx.recipientId === battle.participantAId) side = 'A';
          else if (giftTx.recipientId === battle.participantBId) side = 'B';
          if (!side) return;
          const scores = await normalBattleService.addScore(battle.id, side, giftTx.coinCost);
          io.to(`battle:${battle.id}`).emit(BATTLE_EVENTS.SCORE_UPDATED, {
            battleId: battle.id, ...scores,
          });
        })
        .catch(() => {});

      if (giftTx.recipientId) {
        void calcService
          .addPoints(body.roomId, senderId, giftTx.recipientId, giftTx.coinCost)
          .catch(() => {});
      }
    }

    const sellerRatesPayload = (
      giftTx as { sellerRatesPayload?: Record<string, string> }
    ).sellerRatesPayload;
    const coinSellerUserId = (giftTx as { coinSellerUserId?: string }).coinSellerUserId;

    for (const credit of giftTx.commissionCredits) {
      io.to(`user:${credit.ownerId}`).emit('commission:credited', {
        giftTxId: giftTx.id,
        agencyId: credit.agencyId,
        commissionType: credit.commissionType,
        amount: credit.amount,
        rateApplied: credit.rateApplied,
        hostId: giftTx.recipientId,
        hostName: giftTx.recipient.displayName,
        giftName: giftTx.gift.name,
        giftIcon: giftTx.gift.icon,
        qty: giftTx.qty,
        sellerRates:
          coinSellerUserId && credit.ownerId === coinSellerUserId
            ? sellerRatesPayload
            : undefined,
      });
    }

    if (giftTx.recipientId) {
      io.to(`user:${giftTx.recipientId}`).emit('host:stats_tick', {
        reason: 'gift',
        beansAdded: giftTx.hostBeans,
      });
    }
  } catch (err) {
    console.error('[Gift] Failed to broadcast socket events:', err);
  }
}

/** GET /gifts/received/:userId */
export async function getReceived(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '16'), 10)));
    const data = await giftsService.getReceivedGiftGallery(req.params.userId, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /gifts/lucky/history — caller's lucky-draw history */
export async function getLuckyHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = historyQuerySchema.parse(req.query);
    ok(res, await luckyGiftsService.getLuckyHistory(req.user!.id, page, limit));
  } catch (err) { next(err); }
}

/** GET /gifts/lucky/room/:roomId/winners — recent lucky winners in a room */
export async function getRoomLuckyWinners(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '30'), 10)));
    ok(res, await luckyGiftsService.getRoomLuckyWinners(req.params.roomId, limit));
  } catch (err) { next(err); }
}

/** GET /gifts/history — caller's sent-gift history (normal + lucky) */
export async function getSentHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = historyQuerySchema.parse(req.query);
    ok(res, await luckyGiftsService.getSentGiftHistory(req.user!.id, page, limit));
  } catch (err) { next(err); }
}

/** GET /gifts */
export async function getCatalogue(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await giftsService.getCatalogue();
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /gifts/send */
export async function sendGift(req: Request, res: Response, next: NextFunction) {
  try {
    const body = sendGiftSchema.parse(req.body);
    const senderId = req.user!.id;
    const giftTx = await giftsService.sendGift({
      senderId,
      giftId: body.giftId,
      recipientId: body.recipientId,
      recipientAgencyId: body.recipientAgencyId,
      qty: body.qty,
      roomId: body.roomId ?? null,
      // Broadcast the animation to room viewers the moment the gift is validated,
      // before coins are deducted (the deduction runs atomically afterwards).
      onAnimationReady: body.roomId
        ? (anim) => emitRoomGiftAnimation(senderId, body.giftId, anim)
        : undefined,
    });

    const { commissionCredits: _credits, hostBeans: _hostBeans, ...giftTxResponse } = giftTx;
    created(res, giftTxResponse);
    void broadcastGiftSideEffects(body, req.user!.id, giftTx);
  } catch (err) { next(err); }
}
