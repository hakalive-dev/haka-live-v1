import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as pkService from './pk.service';
import { getIO } from '../../sockets';
import { ok, created, fail } from '../../utils/response';
import { prisma } from '../../config/prisma';
import { PK_EVENTS } from '../../shared-types';
import { assertNoRiskBlock } from '../../utils/risk-control';

const joinQueueSchema = z.object({ durationSecs: z.number().int().refine(v => [300, 600, 1800].includes(v)) });
const inviteSchema = z.object({
  toRoomId: z.string().uuid(),
  toHostId: z.string().uuid(),
  durationSecs: z.number().int().refine(v => [300, 600, 1800].includes(v)),
});
const respondSchema = z.object({ accept: z.boolean() });

export async function joinQueue(req: Request, res: Response, next: NextFunction) {
  try {
    await assertNoRiskBlock(req.user!.id, 'disableGames');
    const { durationSecs } = joinQueueSchema.parse(req.body);
    await pkService.joinQueue(req.user!.id, durationSecs);
    ok(res, { queued: true, durationSecs });
  } catch (err) { next(err); }
}

export async function leaveQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const { durationSecs } = joinQueueSchema.parse(req.body);
    await pkService.leaveQueue(req.user!.id, durationSecs);
    ok(res, { queued: false });
  } catch (err) { next(err); }
}

export async function getLiveRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const excludeRoomId = (req.query.excludeRoomId as string) ?? '';
    const rooms = await pkService.getLiveRoomsForPk(excludeRoomId);
    ok(res, rooms);
  } catch (err) { next(err); }
}

export async function sendInvite(req: Request, res: Response, next: NextFunction) {
  try {
    await assertNoRiskBlock(req.user!.id, 'disableGames');
    const body = inviteSchema.parse(req.body);
    const callerRoom = await prisma.room.findFirst({ where: { hostId: req.user!.id, status: 'live' } });
    if (!callerRoom) return fail(res, 'You must be live to send a PK invite', 400);

    const invite = await pkService.createInvite({
      fromRoomId: callerRoom.id,
      toRoomId: body.toRoomId,
      fromHostId: req.user!.id,
      toHostId: body.toHostId,
      durationSecs: body.durationSecs,
    });

    try {
      getIO().to(`user:${body.toHostId}`).emit(PK_EVENTS.INVITED, {
        inviteId: invite.id,
        fromRoomId: callerRoom.id,
        fromHostId: req.user!.id,
        durationSecs: body.durationSecs,
        expiresAt: invite.expiresAt,
      });
    } catch { /* socket may not be connected */ }

    created(res, { inviteId: invite.id });
  } catch (err) { next(err); }
}

export async function respondToInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const { accept } = respondSchema.parse(req.body);
    const inviteId = req.params.inviteId;
    if (accept) await assertNoRiskBlock(req.user!.id, 'disableGames');

    if (!accept) {
      await pkService.declineInvite(inviteId);
      return ok(res, { accepted: false });
    }

    const match = await pkService.acceptInvite(inviteId);
    const io = getIO();

    await io.in(match.roomAId).socketsJoin(`pk:${match.id}`);
    await io.in(match.roomBId).socketsJoin(`pk:${match.id}`);

    const endsAt = match.endsAt;
    io.to(`pk:${match.id}`).emit(PK_EVENTS.STARTED, {
      matchId: match.id,
      hostAId: match.hostAId,
      hostBId: match.hostBId,
      roomAId: match.roomAId,
      roomBId: match.roomBId,
      scoreA: 0,
      scoreB: 0,
      durationSecs: match.durationSecs,
      endsAt,
    });

    ok(res, { accepted: true, matchId: match.id, endsAt });
  } catch (err) { next(err); }
}
