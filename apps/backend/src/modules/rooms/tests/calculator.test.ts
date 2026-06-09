import request from 'supertest';
import app from '../../../app';
import { resetDb, createTestUser, mintJwt } from '../../../tests/db-helpers';
import { prisma } from '../../../config/prisma';

const calcScoreEmit = jest.fn();
jest.mock('../../../sockets', () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: calcScoreEmit })),
    sockets: {
      adapter: { rooms: { get: jest.fn().mockReturnValue(new Set()) } },
      sockets: { get: jest.fn() },
    },
  })),
}));

beforeEach(async () => {
  await resetDb();
  calcScoreEmit.mockClear();
});

async function createRoom(hostId: string) {
  return prisma.room.create({
    data: {
      hostId,
      title: 'Test Room',
      agoraChannel: `ch-${Date.now()}`,
      micConfig: 5,
    },
  });
}

async function takeSeat(roomId: string, userId: string, position: number) {
  return prisma.roomSeat.upsert({
    where: { roomId_position: { roomId, position } },
    create: { roomId, userId, position },
    update: { userId },
  });
}

describe('POST /rooms/:id/calculator/start', () => {
  it('201 — host starts a finite session', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const room = await createRoom(host.id);

    const res = await request(app)
      .post(`/api/v1/rooms/${room.id}/calculator/start`)
      .set('Authorization', `Bearer ${mintJwt(host.id)}`)
      .send({ durationSeconds: 300 });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.durationSeconds).toBe(300);
    expect(res.body.data.endsAt).toBeTruthy();
  });

  it('201 — host starts an infinite session (durationSeconds: null)', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const room = await createRoom(host.id);

    const res = await request(app)
      .post(`/api/v1/rooms/${room.id}/calculator/start`)
      .set('Authorization', `Bearer ${mintJwt(host.id)}`)
      .send({ durationSeconds: null });

    expect(res.status).toBe(201);
    expect(res.body.data.durationSeconds).toBeNull();
    expect(res.body.data.endsAt).toBeNull();
  });

  it('403 — non-host cannot start', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const other = await createTestUser();
    const room = await createRoom(host.id);

    const res = await request(app)
      .post(`/api/v1/rooms/${room.id}/calculator/start`)
      .set('Authorization', `Bearer ${mintJwt(other.id)}`)
      .send({ durationSeconds: 300 });

    expect(res.status).toBe(403);
  });

  it('409 — cannot start when session already active', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const room = await createRoom(host.id);
    await prisma.calculatorSession.create({
      data: { roomId: room.id, status: 'active' },
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${room.id}/calculator/start`)
      .set('Authorization', `Bearer ${mintJwt(host.id)}`)
      .send({ durationSeconds: 300 });

    expect(res.status).toBe(409);
  });
});

describe('POST /rooms/:id/calculator/end', () => {
  it('200 — host ends active session', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const room = await createRoom(host.id);
    await prisma.calculatorSession.create({
      data: { roomId: room.id, status: 'active' },
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${room.id}/calculator/end`)
      .set('Authorization', `Bearer ${mintJwt(host.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.session.status).toBe('ended');
  });

  it('404 — no active session to end', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const room = await createRoom(host.id);

    const res = await request(app)
      .post(`/api/v1/rooms/${room.id}/calculator/end`)
      .set('Authorization', `Bearer ${mintJwt(host.id)}`);

    expect(res.status).toBe(404);
  });
});

describe('mic-exit auto-end helper — endActiveSessionForRoom', () => {
  it('ends the active session without host permission context', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const other = await createTestUser();
    const room = await createRoom(host.id);
    await takeSeat(room.id, other.id, 2);

    const session = await prisma.calculatorSession.create({
      data: { roomId: room.id, status: 'active' },
    });
    await prisma.calculatorSeatScore.create({
      data: { sessionId: session.id, roomId: room.id, userId: other.id, seatPosition: 2, points: 123 },
    });

    const { endActiveSessionForRoom } = await import('../calculator.service');
    const result = await endActiveSessionForRoom(room.id);

    expect(result).not.toBeNull();
    expect(result!.session.status).toBe('ended');
    expect(result!.scores).toHaveLength(1);
    expect(result!.scores[0].userId).toBe(other.id);
    expect(result!.scores[0].points).toBe(123);
  });
});

describe('GET /rooms/:id/calculator', () => {
  it('200 — returns null session when none active', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const room = await createRoom(host.id);

    const res = await request(app)
      .get(`/api/v1/rooms/${room.id}/calculator`);

    expect(res.status).toBe(200);
    expect(res.body.data.session).toBeNull();
    expect(res.body.data.scores).toEqual([]);
  });

  it('200 — returns active session with scores', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const room = await createRoom(host.id);
    const session = await prisma.calculatorSession.create({
      data: { roomId: room.id, status: 'active' },
    });
    await prisma.calculatorSeatScore.create({
      data: { sessionId: session.id, roomId: room.id, userId: host.id, seatPosition: 1, points: 500 },
    });

    const res = await request(app)
      .get(`/api/v1/rooms/${room.id}/calculator`);

    expect(res.status).toBe(200);
    expect(res.body.data.session.id).toBe(session.id);
    expect(res.body.data.scores).toHaveLength(1);
    expect(res.body.data.scores[0].points).toBe(500);
  });
});

describe('gift hook — addPoints', () => {
  it('increments score when a seated user receives a gift during an active session', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const sender = await createTestUser({ coinBalance: 10_000 });
    const room = await createRoom(host.id);
    await takeSeat(room.id, host.id, 1);

    const session = await prisma.calculatorSession.create({
      data: { roomId: room.id, status: 'active' },
    });

    const rose = await prisma.gift.findFirstOrThrow({ where: { name: 'Rose' } });

    await request(app)
      .post('/api/v1/gifts/send')
      .set('Authorization', `Bearer ${mintJwt(sender.id)}`)
      .send({ giftId: rose.id, recipientId: host.id, roomId: room.id, qty: 1 });

    // broadcastGiftSideEffects runs addPoints async; allow it to settle
    await new Promise((r) => setTimeout(r, 200));

    const score = await prisma.calculatorSeatScore.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId: host.id } },
    });
    expect(score).not.toBeNull();
    expect(score!.points).toBe(rose.coinCost);

    const contribution = await prisma.calculatorGiftContribution.findUnique({
      where: {
        sessionId_senderId_recipientId: {
          sessionId: session.id,
          senderId: sender.id,
          recipientId: host.id,
        },
      },
    });
    expect(contribution).not.toBeNull();
    expect(contribution!.points).toBe(rose.coinCost);

    expect(calcScoreEmit).toHaveBeenCalledWith(
      'calculator:score_update',
      expect.objectContaining({
        sessionId: session.id,
        scores: expect.arrayContaining([
          expect.objectContaining({ userId: host.id, points: rose.coinCost }),
        ]),
      }),
    );
  });

  it('does not create a score when there is no active session', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const sender = await createTestUser({ coinBalance: 10_000 });
    const room = await createRoom(host.id);
    await takeSeat(room.id, host.id, 1);

    const rose = await prisma.gift.findFirstOrThrow({ where: { name: 'Rose' } });

    await request(app)
      .post('/api/v1/gifts/send')
      .set('Authorization', `Bearer ${mintJwt(sender.id)}`)
      .send({ giftId: rose.id, recipientId: host.id, roomId: room.id, qty: 1 });

    const count = await prisma.calculatorSeatScore.count();
    expect(count).toBe(0);
  });
});

describe('seat-leave hook — resetScore', () => {
  it('deletes the score row when called directly (service unit test)', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const room = await createRoom(host.id);
    await takeSeat(room.id, host.id, 1);

    const session = await prisma.calculatorSession.create({
      data: { roomId: room.id, status: 'active' },
    });
    await prisma.calculatorSeatScore.create({
      data: { sessionId: session.id, roomId: room.id, userId: host.id, seatPosition: 1, points: 250 },
    });

    const { resetScore } = await import('../calculator.service');
    await resetScore(room.id, host.id);

    const score = await prisma.calculatorSeatScore.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId: host.id } },
    });
    expect(score).toBeNull();
  });
});
