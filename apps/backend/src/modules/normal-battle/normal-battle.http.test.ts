jest.mock('../../config/firebase', () => ({
  firebaseAdmin: { auth: () => ({ verifyIdToken: jest.fn() }) },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    normalBattle: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    room: { findUnique: jest.fn() },
    roomSeat: { findMany: jest.fn() },
    ban: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    accountRisk: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

jest.mock('../../config/redis', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    incrby: jest.fn().mockResolvedValue(0),
    mget: jest.fn().mockResolvedValue([null, null]),
  },
}));

jest.mock('../../sockets', () => ({
  getIO: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })), in: jest.fn(() => ({ socketsLeave: jest.fn() })), sockets: { adapter: { rooms: { get: jest.fn().mockReturnValue(new Set()) } }, sockets: { get: jest.fn() } } })),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const HOST_ID   = 'host-uuid-1';
const ROOM_ID   = 'room-uuid-1';
const PART_A    = 'user-a-uuid';
const PART_B    = 'user-b-uuid';

const mockBattle = prisma.normalBattle as unknown as {
  create: jest.Mock; findFirst: jest.Mock; update: jest.Mock;
};
const mockRoom   = prisma.room as unknown as { findUnique: jest.Mock };
const mockSeat   = prisma.roomSeat as unknown as { findMany: jest.Mock };

function makeToken(userId = HOST_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const baseRoom = { id: ROOM_ID, hostId: HOST_ID, status: 'live' };

const occupiedSeats = [
  { userId: PART_A, position: 1, isMuted: false },
  { userId: PART_B, position: 2, isMuted: false },
];

const baseBattle = {
  id: 'battle-1', roomId: ROOM_ID, hostId: HOST_ID,
  participantAId: PART_A, participantBId: PART_B,
  mode: 'coins', status: 'active', durationSecs: 300,
  scoreA: 0, scoreB: 0, startedAt: new Date(),
};

beforeEach(() => jest.clearAllMocks());

describe('POST /api/v1/rooms/:roomId/battle', () => {
  it('returns 201 and starts the battle', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);
    mockSeat.findMany.mockResolvedValue(occupiedSeats);
    mockBattle.findFirst.mockResolvedValue(null);
    mockBattle.create.mockResolvedValue(baseBattle);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/battle`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ participantAId: PART_A, participantBId: PART_B, mode: 'coins', durationSecs: 300 });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('battle-1');
    expect(res.body.data.mode).toBe('coins');
  });

  it('returns 403 if caller is not the room host', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/battle`)
      .set('Authorization', `Bearer ${makeToken('other-user')}`)
      .send({ participantAId: PART_A, participantBId: PART_B, mode: 'coins', durationSecs: 300 });

    expect(res.status).toBe(403);
  });

  it('returns 404 if room not found', async () => {
    mockRoom.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/battle`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ participantAId: PART_A, participantBId: PART_B, mode: 'coins', durationSecs: 300 });

    expect(res.status).toBe(404);
  });

  it('returns 400 if a participant is not on a seat', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);
    mockSeat.findMany.mockResolvedValue([{ userId: PART_A, position: 1 }]); // PART_B not seated

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/battle`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ participantAId: PART_A, participantBId: PART_B, mode: 'coins', durationSecs: 300 });

    expect(res.status).toBe(400);
  });

  it('returns 409 if battle already active', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);
    mockSeat.findMany.mockResolvedValue(occupiedSeats);
    mockBattle.findFirst.mockResolvedValue(baseBattle);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/battle`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ participantAId: PART_A, participantBId: PART_B, mode: 'coins', durationSecs: 300 });

    expect(res.status).toBe(409);
  });

  it('returns 400 for invalid mode', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/battle`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ participantAId: PART_A, participantBId: PART_B, mode: 'invalid', durationSecs: 300 });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/battle`)
      .send({ participantAId: PART_A, participantBId: PART_B, mode: 'coins', durationSecs: 300 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/rooms/:roomId/battle/cancel', () => {
  it('returns 200 and cancels the battle', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);
    mockBattle.findFirst.mockResolvedValue(baseBattle);
    mockBattle.update.mockResolvedValue({ ...baseBattle, status: 'cancelled' });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/battle/cancel`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
  });

  it('returns 403 if caller is not the room host', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/battle/cancel`)
      .set('Authorization', `Bearer ${makeToken('other-user')}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 if no active battle', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);
    mockBattle.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/battle/cancel`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});
