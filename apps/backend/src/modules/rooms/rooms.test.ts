/**
 * Feature 3 — Room System
 * Tests: create/list/get/update room, start/end lifecycle,
 *        seat take/leave/lock/kick
 *
 * Prisma and Firebase Admin are fully mocked — no real DB needed.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
  },
}));

jest.mock('../../utils/jwt', () => {
  const actualJwt = jest.requireActual('../../utils/jwt');
  return {
    ...actualJwt,
    verifyAccessToken: jest.fn((token) => {
      // Simple mock that extracts payload from signed token without verifying signature
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return { ...payload, iat: Math.floor(Date.now() / 1000) };
    }),
  };
});

jest.mock('../../config/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    scard: jest.fn().mockResolvedValue(0),
    pipeline: jest.fn(() => ({
      scard: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 0]]),
    })),
    hgetall: jest.fn().mockResolvedValue(null),
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    hexists: jest.fn().mockResolvedValue(0),
    hget: jest.fn().mockResolvedValue(null),
    mget: jest.fn().mockResolvedValue([null, null]),
    incrby: jest.fn().mockResolvedValue(0),
    zadd: jest.fn().mockResolvedValue(1),
    zrem: jest.fn().mockResolvedValue(1),
    zrange: jest.fn().mockResolvedValue([]),
    duplicate: jest.fn(() => ({
      on: jest.fn(),
      connect: jest.fn(),
    })),
    on: jest.fn(),
  },
}));

jest.mock('../../sockets', () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({
      emit: jest.fn(),
    })),
  })),
}));

jest.mock('../../config/prisma', () => {
  const db: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ isHostBanned: false }),
      update: jest.fn().mockResolvedValue({}),
    },
    userTag: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    room: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    roomSeat: {
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    roomAdmin: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    roomMessage: {
      create: jest.fn(),
    },
    roomMusicTrack: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ban: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
    },
    theme: {
      findUnique: jest.fn(),
    },
    userStoreItem: {
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: any) =>
    typeof fn === 'function' ? fn(db) : Promise.all(fn),
  );
  return { prisma: db };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { dedupeUserSeatOccupancy, ensureHostSeatedAtPositionOne } from './rooms.service';

const mockRedisHgetall = redis.hgetall as jest.Mock;

const mockRoom = prisma.room as unknown as {
  create: jest.Mock;
  update: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
};
const mockRoomSeat = prisma.roomSeat as unknown as {
  update: jest.Mock;
  updateMany: jest.Mock;
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  deleteMany: jest.Mock;
  createMany: jest.Mock;
};
const mockBan = prisma.ban as unknown as {
  findFirst: jest.Mock;
  updateMany: jest.Mock;
  create: jest.Mock;
};
const mockRoomMessage = prisma.roomMessage as unknown as {
  create: jest.Mock;
};
const mockRoomAdmin = prisma.roomAdmin as unknown as {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
};
const mockTheme = prisma.theme as unknown as {
  findUnique: jest.Mock;
};
const mockUserStoreItem = prisma.userStoreItem as unknown as {
  findFirst: jest.Mock;
};
const mockQueryRaw = prisma as unknown as { $queryRaw: jest.Mock };

// ── Fixtures ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const HOST_ID = 'host-user-1';
const OTHER_ID = 'other-user-1';
const ADMIN_ID = 'admin-user-1';
const OTHER_ADMIN_ID = 'admin-user-2';
const TARGET_UUID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = 'room-uuid-1';

function makeAccessToken(userId = HOST_ID, role = 'host') {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: '15m' });
}

const baseSeats = Array.from({ length: 5 }, (_, i) => ({
  id: `seat-${i + 1}`,
  roomId: ROOM_ID,
  position: i + 1,
  userId: i === 0 ? HOST_ID : null, // position 1 = host
  isLocked: false,
  isMuted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: i === 0 ? { id: HOST_ID, username: 'host', displayName: 'Host', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] } : null,
}));

const baseRoom = {
  id: ROOM_ID,
  hostId: HOST_ID,
  title: 'Test Room',
  description: '',
  coverImage: '',
  category: 'general',
  type: 'public',
  roomMode: 'chat',
  status: 'idle',
  micConfig: 5,
  isLocked: false,
  password: null,
  viewerCount: 0,
  agoraChannel: ROOM_ID,
  startedAt: null,
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  host: { id: HOST_ID, username: 'host', displayName: 'Host', avatar: '', hakaId: 'HAKA12345678', activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
  seats: baseSeats,
};

const liveRoom = { ...baseRoom, status: 'live', startedAt: new Date() };

// ── POST /api/v1/rooms ────────────────────────────────────────────────────────

describe('POST /api/v1/rooms', () => {
  beforeEach(() => {
    mockRoomSeat.findFirst.mockResolvedValue(null);
    mockRoomSeat.deleteMany.mockResolvedValue({ count: 0 });
    mockRoomSeat.createMany.mockResolvedValue({ count: 0 });
  });

  it('returns 201 with created room', async () => {
    mockRoom.findFirst.mockResolvedValue(null); // no existing active room
    mockRoom.create.mockResolvedValue(baseRoom);
    mockRoom.update.mockResolvedValue(baseRoom); // agoraChannel update + re-fetch
    mockRoomSeat.update.mockResolvedValue(baseSeats[0]); // host takes seat 1

    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ title: 'Test Room', micConfig: 5 });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Test Room');
    expect(res.body.data.hostId).toBe(HOST_ID);
  });

  it('returns 409 when host already has an active room', async () => {
    mockRoom.findFirst.mockResolvedValue(baseRoom); // existing active room

    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ title: 'Test Room' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/active room/i);
  });

  it('returns 400 on invalid micConfig', async () => {
    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ title: 'Test Room', micConfig: 7 }); // 7 is not valid

    expect(res.status).toBe(400);
  });

  it('persists roomMode when provided', async () => {
    const liveBaseRoom = { ...baseRoom, roomMode: 'live' };
    mockRoom.findFirst.mockResolvedValue(null);
    mockRoom.create.mockResolvedValue(liveBaseRoom);
    mockRoom.update.mockResolvedValue(liveBaseRoom);
    mockRoomSeat.update.mockResolvedValue(baseSeats[0]);

    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ title: 'Live Room', micConfig: 5, roomMode: 'live' });

    expect(res.status).toBe(201);
    expect(res.body.data.roomMode).toBe('live');
  });

  it('defaults roomMode to chat when not provided', async () => {
    mockRoom.findFirst.mockResolvedValue(null);
    mockRoom.create.mockResolvedValue(baseRoom); // baseRoom has roomMode: 'chat'
    mockRoom.update.mockResolvedValue(baseRoom);
    mockRoomSeat.update.mockResolvedValue(baseSeats[0]);

    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ title: 'Chat Room', micConfig: 5 });

    expect(res.status).toBe(201);
    expect(res.body.data.roomMode).toBe('chat');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ micConfig: 5 });

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/v1/rooms')
      .send({ title: 'Test Room' });

    expect(res.status).toBe(401);
  });

  it('reopens the latest ended room instead of creating a new row', async () => {
    const ended = {
      ...baseRoom,
      status: 'ended',
      endedAt: new Date(),
      micConfig: 5,
    };
    mockRoom.findFirst.mockImplementation(async (args: { where?: { status?: unknown } }) => {
      const st = args?.where?.status as Record<string, unknown> | string | undefined;
      if (st && typeof st === 'object' && 'in' in st) return null;
      if (st === 'ended') return ended;
      return null;
    });
    mockRoom.update.mockResolvedValue({ ...baseRoom, status: 'idle', endedAt: null });
    mockRoomSeat.update.mockResolvedValue(baseSeats[0]);

    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ title: 'Back Again', micConfig: 5 });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(ROOM_ID);
    expect(mockRoom.create).not.toHaveBeenCalled();
    expect(mockRoom.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ROOM_ID },
        data: expect.objectContaining({
          status: 'idle',
          endedAt: null,
          title: 'Back Again',
        }),
      }),
    );
  });

  it('returns 400 when reopen shrinks mic config while upper seats are occupied', async () => {
    const ended = {
      ...baseRoom,
      status: 'ended',
      endedAt: new Date(),
      micConfig: 10,
    };
    mockRoom.findFirst.mockImplementation(async (args: { where?: { status?: unknown } }) => {
      const st = args?.where?.status as Record<string, unknown> | string | undefined;
      if (st && typeof st === 'object' && 'in' in st) return null;
      if (st === 'ended') return ended;
      return null;
    });
    mockRoomSeat.findFirst.mockResolvedValue({
      id: 'seat-occ',
      roomId: ROOM_ID,
      position: 9,
      userId: OTHER_ID,
    });

    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ title: 'Too Small', micConfig: 5 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/shrink/i);
    expect(mockRoom.create).not.toHaveBeenCalled();
  });
});

// ── GET /api/v1/rooms ─────────────────────────────────────────────────────────

describe('GET /api/v1/rooms', () => {
  it('returns paginated list of live public rooms', async () => {
    mockRoom.findMany.mockResolvedValue([{ ...liveRoom, _count: { seats: 5 } }]);
    mockRoom.count.mockResolvedValue(1);

    const res = await request(app).get('/api/v1/rooms');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
  });

  it('hydrates viewerCount from Redis SCARD for each live room', async () => {
    mockRoom.findMany.mockResolvedValue([{ ...liveRoom, _count: { seats: 5 } }]);
    mockRoom.count.mockResolvedValue(1);
    mockRoomSeat.findMany.mockResolvedValueOnce([]);

    const mockPipeline = {
      scard: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 17]]),
    };
    (redis.pipeline as jest.Mock).mockReturnValueOnce(mockPipeline);

    const res = await request(app).get('/api/v1/rooms');

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].viewerCount).toBe(17);
    expect(redis.pipeline).toHaveBeenCalled();
  });

  it('uses occupied mic seats when Redis viewer count is zero', async () => {
    mockRoom.findMany.mockResolvedValue([{ ...liveRoom, _count: { seats: 5 } }]);
    mockRoom.count.mockResolvedValue(1);
    mockRoomSeat.findMany.mockResolvedValueOnce([
      { roomId: ROOM_ID, userId: HOST_ID },
      { roomId: ROOM_ID, userId: 'other-user' },
    ]);

    const mockPipeline = {
      scard: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 0]]),
    };
    (redis.pipeline as jest.Mock).mockReturnValueOnce(mockPipeline);

    const res = await request(app).get('/api/v1/rooms');

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].viewerCount).toBe(2);
  });

  it('filters by category when provided', async () => {
    mockRoom.findMany.mockResolvedValue([]);
    mockRoom.count.mockResolvedValue(0);

    const res = await request(app).get('/api/v1/rooms?category=music');

    expect(res.status).toBe(200);
    expect(mockRoom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: 'music' }),
      }),
    );
  });

  it('returns 400 on invalid category', async () => {
    const res = await request(app).get('/api/v1/rooms?category=invalid');
    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/rooms/:id ─────────────────────────────────────────────────────

describe('GET /api/v1/rooms/:id', () => {
  it('returns 200 with room detail', async () => {
    mockRoom.findUnique.mockResolvedValue({ ...baseRoom, theme: null });

    const res = await request(app).get(`/api/v1/rooms/${ROOM_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ROOM_ID);
    expect(res.body.data.seats).toHaveLength(5);
  });

  it('returns 404 when room does not exist', async () => {
    mockRoom.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/rooms/nonexistent');

    expect(res.status).toBe(404);
  });

  it('auto-seats host on GET when host has no mic seat', async () => {
    const vacantSeats = baseSeats.map((s) =>
      s.position === 1 ? { ...s, userId: null, user: null } : s,
    );
    const seatedSeats = baseSeats.map((s) =>
      s.position === 1
        ? {
            ...s,
            userId: HOST_ID,
            user: baseRoom.host,
          }
        : s,
    );

    mockRoom.findUnique
      .mockResolvedValueOnce({ hostId: HOST_ID, status: 'live' })
      .mockResolvedValueOnce({ ...baseRoom, status: 'live', seats: seatedSeats });
    mockRoomSeat.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ position: 1 });
    mockRoomSeat.update.mockResolvedValue({
      position: 1,
      roomId: ROOM_ID,
      userId: HOST_ID,
      isLocked: false,
      isMuted: false,
      user: baseRoom.host,
    });

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(200);
    expect(mockRoomSeat.update).toHaveBeenCalled();
    expect(res.body.data.seats[0].userId).toBe(HOST_ID);
  });
});

// ── PATCH /api/v1/rooms/:id ───────────────────────────────────────────────────

describe('PATCH /api/v1/rooms/:id', () => {
  beforeEach(() => {
    mockRoomAdmin.findUnique.mockResolvedValue(null);
  });

  it('returns 200 when host updates room', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);
    mockRoom.update.mockResolvedValue({ ...baseRoom, title: 'Updated Title' });

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
  });

  it('returns 200 when room admin updates mic and apply mode', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomAdmin.findUnique.mockResolvedValue({
      id: 'admin-1', roomId: ROOM_ID, userId: ADMIN_ID,
    });
    mockRoomSeat.findFirst.mockResolvedValue(null);
    mockRoomSeat.createMany.mockResolvedValue({ count: 5 });
    mockRoom.update.mockResolvedValue({
      ...liveRoom,
      micConfig: 10,
      applyForMic: true,
      seats: Array.from({ length: 10 }, (_, i) => ({
        id: `seat-${i + 1}`,
        roomId: ROOM_ID,
        position: i + 1,
        userId: i === 0 ? HOST_ID : null,
        isLocked: false,
        isMuted: false,
        user: null,
      })),
    });

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}`)
      .set('Authorization', `Bearer ${makeAccessToken(ADMIN_ID)}`)
      .send({ micConfig: 10, applyForMic: true });

    expect(res.status).toBe(200);
    expect(res.body.data.micConfig).toBe(10);
    expect(res.body.data.applyForMic).toBe(true);
  });

  it('returns 403 when room admin updates host-only room fields', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomAdmin.findUnique.mockResolvedValue({
      id: 'admin-1', roomId: ROOM_ID, userId: ADMIN_ID,
    });

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}`)
      .set('Authorization', `Bearer ${makeAccessToken(ADMIN_ID)}`)
      .send({ title: 'Admin Rename' });

    expect(res.status).toBe(403);
  });

  it('returns 403 when non-host tries to update', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom); // hostId = HOST_ID
    mockRoomAdmin.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`)
      .send({ title: 'Hijacked Title' });

    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}`)
      .send({ title: 'Updated' });

    expect(res.status).toBe(401);
  });
});

// ── POST /api/v1/rooms/:id/start ──────────────────────────────────────────────

describe('POST /api/v1/rooms/:id/start', () => {
  beforeEach(() => {
    // Host already on a mic → ensureHostSeatedAtPositionOne is a no-op
    mockRoomSeat.findFirst.mockResolvedValue({ position: 1 });
  });

  it('returns 200 and sets status to live', async () => {
    mockRoom.findUnique
      .mockResolvedValueOnce(baseRoom)
      .mockResolvedValueOnce({ id: ROOM_ID, hostId: HOST_ID, status: 'live' })
      .mockResolvedValueOnce(liveRoom);
    mockRoom.update.mockResolvedValue(liveRoom);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/start`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('live');
  });

  it('returns 400 when room is already live', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/start`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already live/i);
  });

  it('returns 403 when non-host tries to start', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/start`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(403);
  });

  it('sets host.lastLiveAt when room goes live', async () => {
    mockRoom.findFirst.mockResolvedValue({ position: 1 });
    mockRoom.findUnique
      .mockResolvedValueOnce(baseRoom)
      .mockResolvedValueOnce({ id: ROOM_ID, hostId: HOST_ID, status: 'live' })
      .mockResolvedValueOnce(liveRoom);
    mockRoom.update.mockResolvedValue(liveRoom);
    const mockUserUpdate = prisma.user.update as jest.Mock;
    mockUserUpdate.mockClear();

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/start`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: HOST_ID },
        data: expect.objectContaining({ lastLiveAt: expect.any(Date) }),
      }),
    );
  });
});

// ── dedupeUserSeatOccupancy ───────────────────────────────────────────────────

describe('dedupeUserSeatOccupancy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty when user holds at most one seat', async () => {
    mockRoomSeat.findMany.mockResolvedValue([{ position: 1, isLocked: false }]);
    const released = await dedupeUserSeatOccupancy(ROOM_ID, HOST_ID, 1);
    expect(released).toEqual([]);
    expect(mockRoomSeat.update).not.toHaveBeenCalled();
  });

  it('clears duplicate seats and keeps preferred position', async () => {
    mockRoomSeat.findMany.mockResolvedValue([
      { position: 1, isLocked: false },
      { position: 3, isLocked: true },
    ]);
    mockRoomSeat.update.mockResolvedValue({});

    const released = await dedupeUserSeatOccupancy(ROOM_ID, HOST_ID, 1);

    expect(released).toEqual([{ position: 3, isLocked: true }]);
    expect(mockRoomSeat.update).toHaveBeenCalledWith({
      where: { roomId_position: { roomId: ROOM_ID, position: 3 } },
      data: { userId: null, isMuted: false },
    });
  });
});

// ── ensureHostSeatedAtPositionOne (DB truth after socket full-leave) ─────────

describe('ensureHostSeatedAtPositionOne', () => {
  it('returns null when actor is not the host', async () => {
    mockRoom.findUnique.mockResolvedValue({ hostId: HOST_ID, status: 'live' });
    const r = await ensureHostSeatedAtPositionOne(ROOM_ID, OTHER_ID);
    expect(r).toBeNull();
    expect(mockRoomSeat.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when host already holds a seat', async () => {
    mockRoom.findUnique.mockResolvedValue({ hostId: HOST_ID, status: 'live' });
    mockRoomSeat.findFirst.mockResolvedValue({ position: 3 });
    const r = await ensureHostSeatedAtPositionOne(ROOM_ID, HOST_ID);
    expect(r).toBeNull();
    expect(mockRoomSeat.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when no empty unlocked seat exists', async () => {
    mockRoom.findUnique.mockResolvedValue({ hostId: HOST_ID, status: 'live' });
    mockRoomSeat.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const r = await ensureHostSeatedAtPositionOne(ROOM_ID, HOST_ID);
    expect(r).toBeNull();
    expect(mockRoomSeat.update).not.toHaveBeenCalled();
  });

  it('assigns host to lowest empty unlocked seat when host is off all mics', async () => {
    mockRoom.findUnique.mockResolvedValue({ hostId: HOST_ID, status: 'idle' });
    mockRoomSeat.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ position: 1 });
    mockRoomSeat.update.mockResolvedValue({
      position: 1,
      roomId: ROOM_ID,
      userId: HOST_ID,
      isLocked: false,
      isMuted: false,
      user: {
        id: HOST_ID,
        username: 'host',
        displayName: 'Host',
        avatar: '',
        hakaId: null,
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
    });

    const r = await ensureHostSeatedAtPositionOne(ROOM_ID, HOST_ID);
    expect(r).not.toBeNull();
    expect(r!.userId).toBe(HOST_ID);
    expect(r!.position).toBe(1);
    expect(mockRoomSeat.update).toHaveBeenCalled();
  });

  it('returns null for ended room', async () => {
    mockRoom.findUnique.mockResolvedValue({ hostId: HOST_ID, status: 'ended' });
    const r = await ensureHostSeatedAtPositionOne(ROOM_ID, HOST_ID);
    expect(r).toBeNull();
  });
});

// ── POST /api/v1/rooms/:id/end ────────────────────────────────────────────────

describe('POST /api/v1/rooms/:id/end', () => {
  it('returns 200 and sets status to ended', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomSeat.updateMany.mockResolvedValue({ count: 4 });
    mockRoom.update.mockResolvedValue({ ...liveRoom, status: 'ended', endedAt: new Date() });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/end`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ended');
  });

  it('returns 400 when room is already ended', async () => {
    mockRoom.findUnique.mockResolvedValue({ ...baseRoom, status: 'ended' });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/end`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already ended/i);
  });
});

// ── GET /api/v1/rooms/:id/seats ───────────────────────────────────────────────

describe('GET /api/v1/rooms/:id/seats', () => {
  it('returns 200 with seat list', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);
    mockRoomSeat.findMany.mockResolvedValue(baseSeats);

    const res = await request(app).get(`/api/v1/rooms/${ROOM_ID}/seats`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
  });

  it('returns 404 when room does not exist', async () => {
    mockRoom.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/rooms/nonexistent/seats');
    expect(res.status).toBe(404);
  });
});

// ── GET /api/v1/rooms/:id/seat-applicants ─────────────────────────────────────

describe('GET /api/v1/rooms/:id/seat-applicants', () => {
  it('returns 200 with applicants for host', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID });
    mockRedisHgetall.mockResolvedValueOnce({
      [OTHER_ID]: JSON.stringify({
        userId: OTHER_ID,
        displayName: 'Applicant',
        avatar: '',
        username: null,
        hakaId: null,
        seatPosition: null,
        richLevel: 0,
        charmLevel: 0,
        role: 'normal_user',
        hostType: '',
        isVerified: false,
        gender: 'unknown',
        age: null,
        country: '',
        tags: [],
        createdAt: Date.now(),
      }),
    });

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/seat-applicants`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.applicants)).toBe(true);
    expect(res.body.data.applicants).toHaveLength(1);
    expect(res.body.data.applicants[0].userId).toBe(OTHER_ID);
  });

  it('returns 403 for non-host non-admin', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID });
    mockRoomAdmin.findFirst.mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/seat-applicants`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(403);
  });

  it('returns 200 for room admin', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID });
    mockRoomAdmin.findFirst.mockResolvedValueOnce({ id: 'ra-1' });
    mockRedisHgetall.mockResolvedValueOnce({});

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/seat-applicants`)
      .set('Authorization', `Bearer ${makeAccessToken(ADMIN_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.applicants).toEqual([]);
  });
});

// ── POST /api/v1/rooms/:id/seats/:pos/take ────────────────────────────────────

describe('POST /api/v1/rooms/:id/seats/:pos/take', () => {
  const emptySeat = { id: 'seat-2', roomId: ROOM_ID, position: 2, userId: null, isLocked: false, isMuted: false };

  beforeEach(() => {
    mockRoomSeat.findMany.mockResolvedValue([]);
  });

  it('returns 200 when taking an available seat', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockQueryRaw.$queryRaw.mockResolvedValue([{ id: emptySeat.id, user_id: null, is_locked: false }]);
    mockRoomSeat.update.mockResolvedValue({
      ...emptySeat,
      userId: OTHER_ID,
      user: { id: OTHER_ID, username: 'other', displayName: 'Other', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/take`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(OTHER_ID);
  });

  it('returns 409 when seat is already occupied', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockQueryRaw.$queryRaw.mockResolvedValue([{ id: emptySeat.id, user_id: HOST_ID, is_locked: false }]);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/take`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(409);
  });

  it('returns 400 when seat is locked', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockQueryRaw.$queryRaw.mockResolvedValue([{ id: emptySeat.id, user_id: null, is_locked: true }]);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/take`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/locked/i);
  });

  it('returns 200 when taking an available seat 1', async () => {
    const emptySeat1 = {
      id: 'seat-1',
      roomId: ROOM_ID,
      position: 1,
      userId: null,
      isLocked: false,
      isMuted: false,
    };
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockQueryRaw.$queryRaw.mockResolvedValue([
      { id: emptySeat1.id, user_id: null, is_locked: false },
    ]);
    mockRoomSeat.update.mockResolvedValue({
      ...emptySeat1,
      userId: OTHER_ID,
      user: {
        id: OTHER_ID,
        username: 'other',
        displayName: 'Other',
        avatar: '',
        hakaId: null,
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/1/take`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(OTHER_ID);
  });

  it('returns 400 when room is not live', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom); // idle

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/take`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not live/i);
  });
});

// ── POST /api/v1/rooms/:id/seats/:pos/leave ───────────────────────────────────

describe('POST /api/v1/rooms/:id/seats/:pos/leave', () => {
  it('returns 200 when user leaves their seat', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockQueryRaw.$queryRaw.mockResolvedValue([{ user_id: OTHER_ID }]);
    mockRoomSeat.update.mockResolvedValue({
      id: 'seat-2', roomId: ROOM_ID, position: 2, userId: null, isLocked: false, isMuted: false,
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/leave`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(200);
  });

  it('returns 400 when trying to leave a seat not occupied by caller', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockQueryRaw.$queryRaw.mockResolvedValue([{ user_id: HOST_ID }]);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/leave`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(400);
  });

  it('returns 200 when the host leaves seat 1', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockQueryRaw.$queryRaw.mockResolvedValue([{ user_id: HOST_ID }]);
    mockRoomSeat.update.mockResolvedValue({
      id: 'seat-1', roomId: ROOM_ID, position: 1, userId: null, isLocked: false, isMuted: false,
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/1/leave`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(200);
  });

  it('returns 200 when a non-host leaves seat 1 they occupy', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockQueryRaw.$queryRaw.mockResolvedValue([{ user_id: OTHER_ID }]);
    mockRoomSeat.update.mockResolvedValue({
      id: 'seat-1',
      roomId: ROOM_ID,
      position: 1,
      userId: null,
      isLocked: false,
      isMuted: false,
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/1/leave`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(200);
  });

  it('returns 400 when leaving seat 1 occupied by someone else', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockQueryRaw.$queryRaw.mockResolvedValue([{ user_id: HOST_ID }]);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/1/leave`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/rooms/:id/seats/:pos/lock ────────────────────────────────────

describe('POST /api/v1/rooms/:id/seats/:pos/lock', () => {
  beforeEach(() => {
    mockRoomAdmin.findUnique.mockResolvedValue(null);
  });

  it('returns 200 when host locks a seat', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockQueryRaw.$queryRaw.mockResolvedValue([{ id: 'seat-2' }]);
    mockRoomSeat.update.mockResolvedValue({
      id: 'seat-2', position: 2, isLocked: true, userId: null, isMuted: false,
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/lock`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ lock: true });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/locked/i);
  });

  it('returns 403 when non-host tries to lock a seat', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomAdmin.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/lock`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`)
      .send({ lock: true });

    expect(res.status).toBe(403);
  });

  it('returns 200 when room admin locks a seat', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomAdmin.findUnique.mockResolvedValue({
      id: 'admin-1', roomId: ROOM_ID, userId: ADMIN_ID,
    });
    mockQueryRaw.$queryRaw.mockResolvedValue([{ id: 'seat-2' }]);
    mockRoomSeat.update.mockResolvedValue({
      id: 'seat-2', roomId: ROOM_ID, position: 2, isLocked: true, userId: null, isMuted: false,
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/lock`)
      .set('Authorization', `Bearer ${makeAccessToken(ADMIN_ID)}`)
      .send({ lock: true });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/locked/i);
  });

  it('returns 400 when trying to lock seat 1 (host seat)', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/1/lock`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ lock: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/host seat/i);
  });

  it('returns 400 when lock field is missing', async () => {
    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/lock`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({}); // missing lock field

    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/rooms/:id/seats/:pos/kick ────────────────────────────────────

describe('POST /api/v1/rooms/:id/seats/:pos/kick', () => {
  beforeEach(() => {
    mockRoomAdmin.findUnique.mockResolvedValue(null);
  });

  it('returns 200 when host kicks a user from a seat', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomSeat.findUnique.mockResolvedValue({ id: 'seat-2', roomId: ROOM_ID, position: 2, userId: TARGET_UUID });
    mockQueryRaw.$queryRaw.mockResolvedValue([{ id: 'seat-2' }]);
    mockRoomSeat.update.mockResolvedValue({
      id: 'seat-2', position: 2, userId: null, isLocked: false, isMuted: false,
    });
    mockBan.updateMany.mockResolvedValue({ count: 0 });
    mockBan.create.mockResolvedValue({ id: 'ban-1' });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/kick`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/kicked/i);
    expect(res.body.data.cooldownMinutes).toBe(120);
    expect(mockBan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: TARGET_UUID,
          adminId: HOST_ID,
          roomId: ROOM_ID,
          type: 'room',
          banType: 'temporary',
          isActive: true,
        }),
      }),
    );
  });

  it('returns 403 when non-host tries to kick', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/kick`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(403);
  });

  it('returns 400 when trying to kick from seat 1 (host seat)', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/1/kick`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/host/i);
  });

  it('returns 403 when room admin tries to kick another room admin from a seat', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomAdmin.findUnique.mockImplementation(
      ({ where }: { where: { roomId_userId: { userId: string } } }) => {
        const uid = where.roomId_userId.userId;
        if (uid === ADMIN_ID) {
          return Promise.resolve({ id: 'admin-1', roomId: ROOM_ID, userId: ADMIN_ID });
        }
        if (uid === OTHER_ADMIN_ID) {
          return Promise.resolve({ id: 'admin-2', roomId: ROOM_ID, userId: OTHER_ADMIN_ID });
        }
        return Promise.resolve(null);
      },
    );
    mockRoomSeat.findUnique.mockResolvedValue({
      id: 'seat-2', roomId: ROOM_ID, position: 2, userId: OTHER_ADMIN_ID,
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/2/kick`)
      .set('Authorization', `Bearer ${makeAccessToken(ADMIN_ID)}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/room owner can kick room admins/i);
  });
});

// ── POST /api/v1/rooms/:id/seats/invite ───────────────────────────────────────

describe('POST /api/v1/rooms/:id/seats/invite', () => {
  const targetUser = {
    id: TARGET_UUID,
    username: 'target',
    displayName: 'Target',
    avatar: '',
    hakaId: 'HAKA99999999',
    equippedFrame: null,
    activeSpecialId: null,
    activeSpecialIdLevel: null,
    activeSpecialIdExpiresAt: null,
    storeItems: [],
  };

  beforeEach(() => {
    mockRoomAdmin.findUnique.mockResolvedValue(null);
  });

  it('returns 200 when room admin invites a listener to mic', async () => {
    mockRoom.findUnique.mockResolvedValue({
      ...liveRoom,
      seats: [
        baseSeats[0],
        { ...baseSeats[1], position: 2, userId: null, isLocked: false },
      ],
    });
    mockRoomAdmin.findUnique.mockResolvedValue({
      id: 'admin-1', roomId: ROOM_ID, userId: ADMIN_ID,
    });
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(targetUser)
      .mockResolvedValueOnce({
        id: ADMIN_ID,
        username: 'admin',
        displayName: 'Admin',
        avatar: '',
        hakaId: 'HAKA11111111',
        equippedFrame: null,
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/invite`)
      .set('Authorization', `Bearer ${makeAccessToken(ADMIN_ID)}`)
      .send({ userId: targetUser.id, position: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.position).toBe(2);
  });

  it('returns 403 when regular viewer invites a listener to mic', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomAdmin.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/seats/invite`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`)
      .send({ userId: targetUser.id, position: 2 });

    expect(res.status).toBe(403);
  });
});

// ── POST /api/v1/rooms/:id/kick ───────────────────────────────────────────────

describe('POST /api/v1/rooms/:id/kick', () => {
  beforeEach(() => {
    mockRoomAdmin.findUnique.mockResolvedValue(null);
  });

  function mockRoomAdminLookup(
    admins: Record<string, { id: string; roomId: string; userId: string } | null>,
  ) {
    mockRoomAdmin.findUnique.mockImplementation(
      ({ where }: { where: { roomId_userId: { userId: string } } }) =>
        Promise.resolve(admins[where.roomId_userId.userId] ?? null),
    );
  }

  it('returns 200 when room admin kicks a non-seated participant', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomAdminLookup({
      [ADMIN_ID]: { id: 'admin-1', roomId: ROOM_ID, userId: ADMIN_ID },
      [TARGET_UUID]: null,
    });
    mockRoomSeat.findMany.mockResolvedValue([]);
    mockBan.updateMany.mockResolvedValue({ count: 0 });
    mockBan.create.mockResolvedValue({ id: 'ban-1' });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/kick`)
      .set('Authorization', `Bearer ${makeAccessToken(ADMIN_ID)}`)
      .send({ userId: TARGET_UUID });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/kicked/i);
    expect(res.body.data.cooldownMinutes).toBe(120);
    expect(mockBan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: TARGET_UUID,
          adminId: ADMIN_ID,
          roomId: ROOM_ID,
          type: 'room',
        }),
      }),
    );
  });

  it('returns 403 when room admin tries to kick another room admin', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomAdminLookup({
      [ADMIN_ID]: { id: 'admin-1', roomId: ROOM_ID, userId: ADMIN_ID },
      [OTHER_ADMIN_ID]: { id: 'admin-2', roomId: ROOM_ID, userId: OTHER_ADMIN_ID },
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/kick`)
      .set('Authorization', `Bearer ${makeAccessToken(ADMIN_ID)}`)
      .send({ userId: OTHER_ADMIN_ID });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/room owner can kick room admins/i);
    expect(mockBan.create).not.toHaveBeenCalled();
  });

  it('returns 200 when host kicks a room admin', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomAdminLookup({
      [OTHER_ADMIN_ID]: { id: 'admin-2', roomId: ROOM_ID, userId: OTHER_ADMIN_ID },
    });
    mockRoomSeat.findMany.mockResolvedValue([]);
    mockBan.updateMany.mockResolvedValue({ count: 0 });
    mockBan.create.mockResolvedValue({ id: 'ban-1' });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/kick`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ userId: OTHER_ADMIN_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.cooldownMinutes).toBe(120);
    expect(mockBan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: OTHER_ADMIN_ID,
          adminId: HOST_ID,
          roomId: ROOM_ID,
          type: 'room',
        }),
      }),
    );
  });

  it('returns 400 when room admin tries to kick the host', async () => {
    mockRoom.findUnique.mockResolvedValue(liveRoom);
    mockRoomAdminLookup({
      [ADMIN_ID]: { id: 'admin-1', roomId: ROOM_ID, userId: ADMIN_ID },
      [HOST_ID]: null,
    });

    const res = await request(app)
      .post(`/api/v1/rooms/${ROOM_ID}/kick`)
      .set('Authorization', `Bearer ${makeAccessToken(ADMIN_ID)}`)
      .send({ userId: HOST_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/host/i);
  });
});

// ── PATCH /api/v1/rooms/:id/chat-lock ─────────────────────────────────────────

describe('PATCH /api/v1/rooms/:id/chat-lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((ops: unknown[]) => Promise.all(ops));
    mockRoomAdmin.findUnique.mockResolvedValue(null);
  });

  it('host locking chat persists a system message "Public message is disabled"', async () => {
    mockRoom.findUnique.mockResolvedValue({ ...liveRoom, chatLocked: false });
    mockRoom.update.mockResolvedValue({ ...liveRoom, chatLocked: true });
    mockRoomMessage.create.mockResolvedValue({
      id: 'msg-1',
      content: 'Public message is disabled',
      type: 'system',
      createdAt: new Date(),
      sender: {
        id: HOST_ID,
        username: 'host',
        displayName: 'Host',
        avatar: '',
        hakaId: 'HAKA12345678',
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
    });

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/chat-lock`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ locked: true });

    expect(res.status).toBe(200);
    expect(res.body.data.chatLocked).toBe(true);
    expect(mockRoomMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomId: ROOM_ID,
          senderId: HOST_ID,
          content: 'Public message is disabled',
          type: 'system',
        }),
      }),
    );
  });

  it('host unlocking chat persists a system message "Public message is enabled"', async () => {
    mockRoom.findUnique.mockResolvedValue({ ...liveRoom, chatLocked: true });
    mockRoom.update.mockResolvedValue({ ...liveRoom, chatLocked: false });
    mockRoomMessage.create.mockResolvedValue({
      id: 'msg-2',
      content: 'Public message is enabled',
      type: 'system',
      createdAt: new Date(),
      sender: {
        id: HOST_ID,
        username: 'host',
        displayName: 'Host',
        avatar: '',
        hakaId: 'HAKA12345678',
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
    });

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/chat-lock`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ locked: false });

    expect(res.status).toBe(200);
    expect(res.body.data.chatLocked).toBe(false);
    expect(mockRoomMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'Public message is enabled',
          type: 'system',
        }),
      }),
    );
  });

  it('returns 403 when a room admin (non-host) tries to toggle chat lock', async () => {
    mockRoom.findUnique.mockResolvedValue({ ...liveRoom, chatLocked: false });
    mockRoomAdmin.findUnique.mockResolvedValue({
      id: 'admin-1', roomId: ROOM_ID, userId: ADMIN_ID,
    });

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/chat-lock`)
      .set('Authorization', `Bearer ${makeAccessToken(ADMIN_ID)}`)
      .send({ locked: true });

    expect(res.status).toBe(403);
    expect(mockRoomMessage.create).not.toHaveBeenCalled();
  });

  it('returns 403 when a regular viewer (not host, not admin) tries to toggle', async () => {
    mockRoom.findUnique.mockResolvedValue({ ...liveRoom, chatLocked: false });

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/chat-lock`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`)
      .send({ locked: true });

    expect(res.status).toBe(403);
    expect(mockRoomMessage.create).not.toHaveBeenCalled();
  });
});

// ── PATCH /api/v1/rooms/:id/theme  &  DELETE /api/v1/rooms/:id/theme ──────────

const THEME_ID = 'theme-uuid-1';
const STORE_ITEM_ID = 'store-item-uuid-1';

const baseTheme = {
  id: THEME_ID,
  name: 'Night Sky',
  gradientFrom: '#0B0B14',
  gradientTo: '#1C1C2E',
  backgroundImageUrl: null,
  svgaUrl: null,
  accentColor: '#7B4FFF',
  chatBubbleColor: '#252538',
  storeItemId: null,
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const paidTheme = { ...baseTheme, id: 'theme-uuid-2', storeItemId: STORE_ITEM_ID };

describe('PATCH /api/v1/rooms/:id/theme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoomAdmin.findUnique.mockResolvedValue(null);
  });

  it('returns 404 when room does not exist', async () => {
    mockRoom.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/theme`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ themeId: THEME_ID });

    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is not the room host', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID });

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/theme`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`)
      .send({ themeId: THEME_ID });

    expect(res.status).toBe(403);
  });

  it('returns 404 when theme does not exist', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID });
    mockTheme.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/theme`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ themeId: THEME_ID });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/theme not found/i);
  });

  it('returns 403 when theme is paid and user does not own it', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID });
    mockTheme.findUnique.mockResolvedValue(paidTheme);
    mockUserStoreItem.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/theme`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ themeId: paidTheme.id });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/do not own/i);
  });

  it('applies a free theme and returns serialized theme', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID });
    mockTheme.findUnique.mockResolvedValue(baseTheme); // storeItemId: null → free
    mockRoom.update.mockResolvedValue({ ...baseRoom, themeId: THEME_ID });

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/theme`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ themeId: THEME_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.theme.id).toBe(THEME_ID);
    expect(res.body.data.theme.gradientFrom).toBe(baseTheme.gradientFrom);
    expect(mockRoom.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { themeId: THEME_ID } }),
    );
    // ownership check must NOT have been called for a free theme
    expect(mockUserStoreItem.findFirst).not.toHaveBeenCalled();
  });

  it('applies a paid theme when the user owns it', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID });
    mockTheme.findUnique.mockResolvedValue(paidTheme);
    mockUserStoreItem.findFirst.mockResolvedValue({
      id: 'usi-1', userId: HOST_ID, itemId: STORE_ITEM_ID,
    });
    mockRoom.update.mockResolvedValue({ ...baseRoom, themeId: paidTheme.id });

    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/theme`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({ themeId: paidTheme.id });

    expect(res.status).toBe(200);
    expect(res.body.data.theme.id).toBe(paidTheme.id);
    expect(mockRoom.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { themeId: paidTheme.id } }),
    );
  });

  it('returns 400 when themeId is missing from the body', async () => {
    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/theme`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .patch(`/api/v1/rooms/${ROOM_ID}/theme`)
      .send({ themeId: THEME_ID });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/rooms/:id/theme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoomAdmin.findUnique.mockResolvedValue(null);
  });

  it('returns 404 when room does not exist', async () => {
    mockRoom.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/rooms/${ROOM_ID}/theme`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is not the room host', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID });

    const res = await request(app)
      .delete(`/api/v1/rooms/${ROOM_ID}/theme`)
      .set('Authorization', `Bearer ${makeAccessToken(OTHER_ID)}`);

    expect(res.status).toBe(403);
  });

  it('resets theme to null and returns 200', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID });
    mockRoom.update.mockResolvedValue({ ...baseRoom, themeId: null });

    const res = await request(app)
      .delete(`/api/v1/rooms/${ROOM_ID}/theme`)
      .set('Authorization', `Bearer ${makeAccessToken(HOST_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset/i);
    expect(mockRoom.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { themeId: null } }),
    );
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .delete(`/api/v1/rooms/${ROOM_ID}/theme`);

    expect(res.status).toBe(401);
  });
});
