import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { getIO } from '../../sockets';
import { BATTLE_EVENTS } from '../../shared-types';
import * as svc from './normal-battle.service';
import { AppError } from '../../middleware/error.middleware';
import { assertNoRiskBlock } from '../../utils/risk-control';

const startSchema = z.object({
  participantAId: z.string().min(1),
  participantBId: z.string().min(1),
  mode: z.enum(['coins', 'votes']),
  durationSecs: z.number().int().positive(),
});

export async function startBattle(req: Request, res: Response, next: NextFunction) {
  try {
    const { roomId } = req.params;
    const userId = req.user!.id;
    await assertNoRiskBlock(userId, 'disableGames');
    const body = startSchema.parse(req.body);

    if (body.participantAId === body.participantBId) {
      throw new AppError('Participants must be different users', 400);
    }

    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { hostId: true, status: true } });
    if (!room) throw new AppError('Room not found', 404);
    if (room.hostId !== userId) throw new AppError('Only the room host can start a battle', 403);
    if (room.status !== 'live') throw new AppError('Room is not live', 400);

    const seats = await prisma.roomSeat.findMany({
      where: { roomId, userId: { in: [body.participantAId, body.participantBId] } },
      select: { userId: true },
    });
    const seatedIds = new Set(seats.map((s) => s.userId));
    if (!seatedIds.has(body.participantAId) || !seatedIds.has(body.participantBId)) {
      throw new AppError('Both participants must be on mic seats', 400);
    }

    const battle = await svc.startBattle({ roomId, hostId: userId, ...body });

    const io = getIO();
    const roomSockets = [...(io.sockets.adapter.rooms.get(roomId) ?? [])];
    for (const sid of roomSockets) {
      const s = io.sockets.sockets.get(sid);
      s?.join(`battle:${battle.id}`);
    }

    const endsAt = new Date(Date.now() + body.durationSecs * 1000).toISOString();
    io.to(roomId).emit(BATTLE_EVENTS.STARTED, {
      battleId: battle.id, roomId, hostId: userId,
      participantAId: body.participantAId, participantBId: body.participantBId,
      mode: body.mode, scoreA: 0, scoreB: 0,
      durationSecs: body.durationSecs, endsAt,
    });

    res.status(201).json({ success: true, data: battle });
  } catch (err) { next(err); }
}

export async function cancelBattle(req: Request, res: Response, next: NextFunction) {
  try {
    const { roomId } = req.params;
    const userId = req.user!.id;

    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { hostId: true } });
    if (!room) throw new AppError('Room not found', 404);
    if (room.hostId !== userId) throw new AppError('Only the room host can cancel a battle', 403);

    const battle = await svc.getActiveBattle(roomId);
    if (!battle) throw new AppError('No active battle in this room', 404);

    await svc.cancelBattle(battle.id);

    const io = getIO();
    io.to(`battle:${battle.id}`).emit(BATTLE_EVENTS.CANCELLED, { battleId: battle.id });
    io.in(`battle:${battle.id}`).socketsLeave(`battle:${battle.id}`);

    res.json({ success: true });
  } catch (err) { next(err); }
}
