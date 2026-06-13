/**
 * Feature 5 — Voice Room WebSocket
 * Tests: Socket.io connection auth, room join/leave, seat management,
 *        hand raise/lower, chat messages, disconnecting cleanup (seat retention)
 *
 * Uses a real Socket.io server on a random port — no HTTP mocking.
 * Prisma is mocked to avoid needing a real database.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Calculator emits via getIO(); in this socket test we bind it to the test server.
let ioServerRef: any;
jest.mock('../sockets', () => ({
  getIO: () => {
    if (!ioServerRef) throw new Error('Socket.io not initialized');
    return ioServerRef;
  },
}));

jest.mock('../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
  },
}));

jest.mock('../config/prisma', () => {
  const db: any = {
    room: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    calculatorSession: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    calculatorSeatScore: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    calculatorGiftContribution: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userTag: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    roomSeat: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userSettings: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null), // hasSuperAdminPower check on join
    },
    userStoreItem: {
      findFirst: jest.fn().mockResolvedValue(null), // entry effect + theme entitlement
    },
    normalBattle: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    roomAdmin: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ban: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    accountRisk: { findFirst: jest.fn().mockResolvedValue(null) },
    roomMessage: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: any) =>
    typeof fn === 'function' ? fn(db) : Promise.all(fn),
  );
  return { prisma: db };
});

jest.mock('../config/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue(null),
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    hexists: jest.fn().mockResolvedValue(0),
    hget: jest.fn().mockResolvedValue(null),
    mget: jest.fn().mockResolvedValue([null, null]),
    incrby: jest.fn().mockResolvedValue(0),
    zadd: jest.fn().mockResolvedValue(1),
    zrem: jest.fn().mockResolvedValue(1),
    scard: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    duplicate: jest.fn(() => ({
      on: jest.fn(),
      connect: jest.fn(),
    })),
    on: jest.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import http from 'http';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { authMiddleware } from './auth';
import { registerRoomHandlers } from './rooms.socket';
import { userActiveRoomKey } from '../modules/rooms/user-active-room';
import { FULL_LEAVE_DEBOUNCE_MS } from '../modules/rooms/room-seat-grace';

const mockRoom = prisma.room as unknown as {
  findUnique: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};
const mockRoomSeat = prisma.roomSeat as unknown as {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};
const mockCalcSession = (prisma as any).calculatorSession as unknown as {
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
};
const mockCalcSeatScore = (prisma as any).calculatorSeatScore as unknown as {
  findMany: jest.Mock;
};
const mockUser = prisma.user as unknown as {
  findUnique: jest.Mock;
  findMany: jest.Mock;
};
const mockRoomMessage = prisma.roomMessage as unknown as {
  create: jest.Mock;
};
const mockBan = prisma.ban as unknown as {
  updateMany: jest.Mock;
  create: jest.Mock;
};
const mockQueryRaw = prisma as unknown as { $queryRaw: jest.Mock };
const mockRedis = redis as unknown as {
  set: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
};

// ── Setup ─────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const HOST_ID = 'host-user-1';
const USER_ID = 'viewer-user-1';
const ROOM_ID = 'room-uuid-1';

function makeToken(userId = USER_ID, role = 'normal_user') {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: '15m' });
}

let httpServer: http.Server;
let ioServer: Server;
let port: number;

function connectClient(token: string): ClientSocket {
  return ioClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    auth: { token },
  });
}

beforeAll((done) => {
  httpServer = http.createServer();
  ioServer = new Server(httpServer, { cors: { origin: '*' } });
  ioServer.use(authMiddleware);
  registerRoomHandlers(ioServer);
  ioServerRef = ioServer;

  httpServer.listen(0, () => {
    const addr = httpServer.address();
    port = typeof addr === 'object' && addr !== null ? addr.port : 0;
    done();
  });
});

afterAll((done) => {
  ioServer.close();
  httpServer.close(done);
});

// ── Auth tests ────────────────────────────────────────────────────────────────

describe('Socket.io authentication', () => {
  it('rejects connection without token', (done) => {
    const client = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: {},
    });
    client.on('connect_error', (err) => {
      expect(err.message).toContain('Authentication required');
      client.close();
      done();
    });
  });

  it('rejects connection with invalid token', (done) => {
    const client = connectClient('invalid-token');
    client.on('connect_error', (err) => {
      expect(err.message).toContain('Invalid or expired token');
      client.close();
      done();
    });
  });

  it('accepts connection with valid token', (done) => {
    const client = connectClient(makeToken());
    client.on('connect', () => {
      expect(client.connected).toBe(true);
      client.close();
      done();
    });
  });

  it('rejects connection from a platform-banned user', (done) => {
    // The handshake middleware reads `prisma.ban.findFirst` via isUserBanned;
    // simulate an active platform ban for this user.
    const banMock = (prisma.ban as any).findFirst as jest.Mock;
    banMock.mockResolvedValueOnce({ id: 'ban-1', type: 'platform', isActive: true });

    const client = connectClient(makeToken('banned-user'));
    client.on('connect_error', (err) => {
      expect(err.message).toContain('suspended');
      client.close();
      done();
    });
    client.on('connect', () => {
      // Should NOT happen — fail loudly if it does.
      client.close();
      done(new Error('Banned user was allowed to connect'));
    });
  });
});

// ── room:join / room:leave ────────────────────────────────────────────────────

describe('room:join / room:leave', () => {
  afterEach(() => {
    const roomAdminFindFirst = (prisma.roomAdmin as any).findFirst as jest.Mock;
    roomAdminFindFirst.mockReset();
    roomAdminFindFirst.mockResolvedValue(null);
  });

  it('joins a live room and receives ack with viewerCount', (done) => {
    mockRoom.findUnique.mockResolvedValue({
      id: ROOM_ID,
      status: 'live',
      hostId: HOST_ID,
      viewerCount: 0,
      isLocked: false,
      password: null,
      theme: null,
      // getRtcUidsForRoom re-reads the room selecting these
      agoraChannel: 'test-channel',
      seats: [],
    });
    mockRoom.updateMany.mockClear();

    const client = connectClient(makeToken());
    client.on('connect', () => {
      client.emit('room:join', { roomId: ROOM_ID }, (ack: any) => {
        expect(ack.ok).toBe(true);
        expect(typeof ack.viewerCount).toBe('number');
        expect(ack.viewerCount).toBeGreaterThanOrEqual(1);
        expect(mockRoom.updateMany).toHaveBeenCalledWith({
          where: { id: ROOM_ID, status: 'live' },
          data: { viewerCount: ack.viewerCount },
        });
        client.close();
        done();
      });
    });
  });

  it('returns a full seat-occupancy snapshot in the join ack', (done) => {
    mockRoom.findUnique.mockResolvedValue({
      id: ROOM_ID,
      status: 'live',
      hostId: HOST_ID,
      viewerCount: 0,
      isLocked: false,
      password: null,
      theme: null,
      // getRtcUidsForRoom re-reads the room selecting these
      agoraChannel: 'test-channel',
      seats: [],
    });
    const seatedUser = {
      id: HOST_ID,
      username: 'host',
      displayName: 'Host',
      avatar: '',
      hakaId: null,
      activeSpecialId: null,
      activeSpecialIdLevel: null,
      activeSpecialIdExpiresAt: null,
      storeItems: [],
    };
    // Existing occupancy: host on seat 1, the rest empty.
    mockRoomSeat.findMany.mockResolvedValue([
      { position: 1, userId: HOST_ID, user: seatedUser, isLocked: false, isMuted: false },
      { position: 2, userId: null, user: null, isLocked: false, isMuted: false },
    ]);

    const client = connectClient(makeToken(USER_ID));
    client.on('connect', () => {
      client.emit('room:join', { roomId: ROOM_ID }, (ack: any) => {
        expect(ack.ok).toBe(true);
        expect(Array.isArray(ack.seats)).toBe(true);
        const seat1 = ack.seats.find((s: any) => s.position === 1);
        expect(seat1.userId).toBe(HOST_ID);
        expect(seat1.user?.id).toBe(HOST_ID);
        const seat2 = ack.seats.find((s: any) => s.position === 2);
        expect(seat2.userId).toBeNull();
        expect(seat2.user).toBeNull();
        mockRoomSeat.findMany.mockResolvedValue([]);
        client.close();
        done();
      });
    });
  });

  it('fails to join an ended room', (done) => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'ended' });

    const client = connectClient(makeToken());
    client.on('connect', () => {
      client.emit('room:join', { roomId: ROOM_ID }, (ack: any) => {
        expect(ack.error).toContain('ended');
        client.close();
        done();
      });
    });
  });

  it('broadcasts user.joined to other clients in the room', (done) => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live' });
    mockUser.findMany.mockResolvedValue([
      { id: USER_ID, username: 'viewer', displayName: 'Viewer', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
    ]);

    // Host joins first
    const host = connectClient(makeToken(HOST_ID));
    host.on('connect', () => {
      host.emit('room:join', { roomId: ROOM_ID }, () => {
        // Listen for user.joined broadcast
        host.on('user.joined', (data) => {
          expect(data.userId).toBe(USER_ID);
          expect(data.displayName).toBe('Viewer');
          host.close();
          viewer.close();
          done();
        });

        // Viewer joins
        const viewer = connectClient(makeToken(USER_ID));
        viewer.on('connect', () => {
          viewer.emit('room:join', { roomId: ROOM_ID }, () => {});
        });
      });
    });
  });

  it('sets user active room redis key on join', (done) => {
    mockRoom.findUnique.mockResolvedValue({
      id: ROOM_ID,
      status: 'live',
      hostId: HOST_ID,
      viewerCount: 0,
      isLocked: false,
      password: null,
      theme: null,
      // getRtcUidsForRoom re-reads the room selecting these
      agoraChannel: 'test-channel',
      seats: [],
    });
    mockRedis.set.mockClear();

    const client = connectClient(makeToken(USER_ID));
    client.on('connect', () => {
      client.emit('room:join', { roomId: ROOM_ID }, () => {
        expect(mockRedis.set).toHaveBeenCalledWith(
          userActiveRoomKey(USER_ID),
          ROOM_ID,
          'EX',
          86400,
        );
        client.close();
        done();
      });
    });
  });

  it('also emits user.joined to the joiner', (done) => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live' });
    mockUser.findMany.mockResolvedValue([
      { id: USER_ID, username: 'viewer', displayName: 'Viewer', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
    ]);

    const viewer = connectClient(makeToken(USER_ID));
    viewer.on('connect', () => {
      viewer.on('user.joined', (data) => {
        expect(data.userId).toBe(USER_ID);
        expect(data.displayName).toBe('Viewer');
        viewer.close();
        done();
      });
      viewer.emit('room:join', { roomId: ROOM_ID }, () => {});
    });
  });

  it('does not broadcast user.joined when the socket is already in the room (Keep return)', async () => {
    // Full fixture: this test asserts ack.ok, and the ack path re-reads the
    // room in getRtcUidsForRoom selecting hostId/agoraChannel/seats.
    mockRoom.findUnique.mockResolvedValue({
      id: ROOM_ID,
      status: 'live',
      hostId: HOST_ID,
      viewerCount: 0,
      isLocked: false,
      password: null,
      theme: null,
      agoraChannel: 'test-channel',
      seats: [],
    });
    mockUser.findMany.mockResolvedValue([
      {
        id: USER_ID,
        username: 'viewer',
        displayName: 'Viewer',
        avatar: '',
        hakaId: null,
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
    ]);

    const host = connectClient(makeToken(HOST_ID));
    await new Promise<void>((r) => host.on('connect', r));
    await new Promise<void>((r) => host.emit('room:join', { roomId: ROOM_ID }, () => r()));

    const viewer = connectClient(makeToken(USER_ID));
    await new Promise<void>((r) => viewer.on('connect', r));
    await new Promise<void>((r) => viewer.emit('room:join', { roomId: ROOM_ID }, () => r()));

    let joinBroadcasts = 0;
    host.on('user.joined', () => {
      joinBroadcasts += 1;
    });

    const secondAck = await new Promise<any>((resolve) =>
      viewer.emit('room:join', { roomId: ROOM_ID }, resolve),
    );

    await new Promise((r) => setTimeout(r, 200));

    expect(secondAck.ok).toBe(true);
    expect(joinBroadcasts).toBe(0);

    host.close();
    viewer.close();
  });

  it('accepts correct password for a locked room (bcrypt $2a$ hash)', async () => {
    const plain = '123456';
    let hash = await bcrypt.hash(plain, 10);
    // Normalize to $2a$ to cover bcrypt variant prefixes.
    if (hash.startsWith('$2b$')) hash = `$2a$${hash.slice(4)}`;

    mockRoom.findUnique.mockResolvedValue({
      id: ROOM_ID,
      status: 'live',
      hostId: HOST_ID,
      viewerCount: 0,
      isLocked: true,
      password: hash,
      theme: null,
      // getRtcUidsForRoom re-reads the room selecting these
      agoraChannel: 'test-channel',
      seats: [],
    });
    mockUser.findMany.mockResolvedValue([
      { id: USER_ID, username: 'viewer', displayName: 'Viewer', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
    ]);

    const client = connectClient(makeToken(USER_ID));
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
    });

    const ack = await new Promise<any>((resolve) =>
      client.emit('room:join', { roomId: ROOM_ID, password: plain }, resolve),
    );
    client.close();
    expect(ack?.ok).toBe(true);
    expect(ack?.error).toBeUndefined();
  });

  it('rejects wrong password for a locked room (bcrypt hash)', async () => {
    const hash = await bcrypt.hash('123456', 10);
    mockRoom.findUnique.mockResolvedValue({
      id: ROOM_ID,
      status: 'live',
      hostId: HOST_ID,
      viewerCount: 0,
      isLocked: true,
      password: hash,
      theme: null,
      // getRtcUidsForRoom re-reads the room selecting these
      agoraChannel: 'test-channel',
      seats: [],
    });

    const client = connectClient(makeToken(USER_ID));
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
    });

    const ack = await new Promise<any>((resolve) =>
      client.emit('room:join', { roomId: ROOM_ID, password: '000000' }, resolve),
    );
    client.close();
    expect(ack?.error).toBe('password_required');
    expect(ack?.isLocked).toBe(true);
  });

  it('room admin joins a locked room without password (bcrypt hash)', async () => {
    const plain = '123456';
    let hash = await bcrypt.hash(plain, 10);
    if (hash.startsWith('$2b$')) hash = `$2a$${hash.slice(4)}`;

    mockRoom.findUnique.mockResolvedValue({
      id: ROOM_ID,
      status: 'live',
      hostId: HOST_ID,
      viewerCount: 0,
      isLocked: true,
      password: hash,
      theme: null,
      // getRtcUidsForRoom re-reads the room selecting these
      agoraChannel: 'test-channel',
      seats: [],
    });
    const roomAdminFindFirst = (prisma.roomAdmin as any).findFirst as jest.Mock;
    roomAdminFindFirst.mockResolvedValueOnce({ id: 'ra-1' });
    mockUser.findMany.mockResolvedValue([
      { id: USER_ID, username: 'adminviewer', displayName: 'Admin', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
    ]);

    const client = connectClient(makeToken(USER_ID));
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
    });

    const ack = await new Promise<any>((resolve) =>
      client.emit('room:join', { roomId: ROOM_ID }, resolve),
    );
    client.close();
    expect(ack?.ok).toBe(true);
    expect(ack?.error).toBeUndefined();
  });

  it('accepts correct password for a locked room (legacy plaintext)', async () => {
    mockRoom.findUnique.mockResolvedValue({
      id: ROOM_ID,
      status: 'live',
      hostId: HOST_ID,
      viewerCount: 0,
      isLocked: true,
      password: '123456',
      theme: null,
      // getRtcUidsForRoom re-reads the room selecting these
      agoraChannel: 'test-channel',
      seats: [],
    });

    const client = connectClient(makeToken(USER_ID));
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
    });

    const ack = await new Promise<any>((resolve) =>
      client.emit('room:join', { roomId: ROOM_ID, password: '123456' }, resolve),
    );
    client.close();
    expect(ack?.ok).toBe(true);
    expect(ack?.error).toBeUndefined();
  });
});

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const LIVE_ROOM_FOR_JOIN = {
  id: ROOM_ID,
  status: 'live',
  hostId: HOST_ID,
  viewerCount: 0,
  isLocked: false,
  password: null,
  theme: null,
      // getRtcUidsForRoom re-reads the room selecting these
      agoraChannel: 'test-channel',
      seats: [],
};

// ── disconnect / multi-socket leave (seat retention) ───────────────────────────

describe('disconnect / multi-socket leave (seat retention)', () => {
  beforeEach(() => {
    mockRoomSeat.updateMany.mockClear();
    mockRoomSeat.findMany.mockReset();
    mockRoomSeat.findMany.mockResolvedValue([{ position: 2, isLocked: false }]);
    mockRoomSeat.updateMany.mockResolvedValue({ count: 1 });
  });

  it('explicit room:leave runs full leave immediately (no ack from server)', async () => {
    mockRoom.findUnique.mockResolvedValue(LIVE_ROOM_FOR_JOIN);
    mockUser.findMany.mockResolvedValue([
      {
        id: USER_ID,
        username: 'viewer',
        displayName: 'Viewer',
        avatar: '',
        hakaId: null,
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
    ]);

    const client = connectClient(makeToken(USER_ID));
    await new Promise<void>((r) => {
      client.on('connect', r);
    });
    await new Promise<void>((r) => {
      client.emit('room:join', { roomId: ROOM_ID }, () => r());
    });

    mockRoomSeat.updateMany.mockClear();
    mockRedis.get.mockResolvedValueOnce(ROOM_ID);
    mockRedis.del.mockClear();
    client.emit('room:leave', { roomId: ROOM_ID });
    await sleep(150);
    expect(mockRoomSeat.updateMany).toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalledWith(userActiveRoomKey(USER_ID));
    client.close();
    await sleep(50);
  });

  it('restores host seat on room:join after explicit leave (ack includes restoredHostSeat)', async () => {
    const hostUser = {
      id: HOST_ID,
      username: 'host',
      displayName: 'Host',
      avatar: '',
      hakaId: null,
      activeSpecialId: null,
      activeSpecialIdLevel: null,
      activeSpecialIdExpiresAt: null,
      storeItems: [],
    };

    mockRoom.findUnique.mockResolvedValue(LIVE_ROOM_FOR_JOIN);
    mockUser.findMany.mockResolvedValue([hostUser]);

    const client = connectClient(makeToken(HOST_ID, 'host'));
    await new Promise<void>((r) => {
      client.on('connect', r);
    });
    await new Promise<void>((r) => {
      client.emit('room:join', { roomId: ROOM_ID }, () => r());
    });

    mockRoomSeat.updateMany.mockClear();
    client.emit('room:leave', { roomId: ROOM_ID });
    await sleep(200);
    expect(mockRoomSeat.updateMany).toHaveBeenCalled();

    mockRoomSeat.findFirst.mockReset();
    mockRoomSeat.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ position: 1 });
    mockRoomSeat.update.mockResolvedValue({
      position: 1,
      userId: HOST_ID,
      isLocked: false,
      isMuted: false,
      user: hostUser,
    });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('room:join ack timeout')), 5000);
      client.emit('room:join', { roomId: ROOM_ID }, (ack: any) => {
        clearTimeout(t);
        try {
          expect(ack.ok).toBe(true);
          expect(ack.restoredHostSeat).toBeDefined();
          expect(ack.restoredHostSeat.position).toBe(1);
          expect(ack.restoredHostSeat.userId).toBe(HOST_ID);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    client.close();
    await sleep(50);
  }, 10000);

  it('clears host seats on explicit room:leave (Exit)', async () => {
    mockRoom.findUnique.mockResolvedValue(LIVE_ROOM_FOR_JOIN);
    mockUser.findMany.mockResolvedValue([
      {
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
    ]);

    const client = connectClient(makeToken(HOST_ID, 'host'));
    await new Promise<void>((r) => {
      client.on('connect', r);
    });
    await new Promise<void>((r) => {
      client.emit('room:join', { roomId: ROOM_ID }, () => r());
    });

    mockRoomSeat.updateMany.mockClear();
    client.emit('room:leave', { roomId: ROOM_ID });
    await sleep(200);
    expect(mockRoomSeat.updateMany).toHaveBeenCalled();
    client.close();
    await sleep(50);
  });

  it('does not clear host seats on debounced disconnect (owner stays on mic)', async () => {
    mockRoom.findUnique.mockResolvedValue(LIVE_ROOM_FOR_JOIN);
    mockUser.findMany.mockResolvedValue([
      {
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
    ]);

    const client = connectClient(makeToken(HOST_ID, 'host'));
    await new Promise<void>((r) => {
      client.on('connect', r);
    });
    await new Promise<void>((r) => {
      client.emit('room:join', { roomId: ROOM_ID }, () => r());
    });

    mockRoomSeat.updateMany.mockClear();
    client.close();
    await sleep(FULL_LEAVE_DEBOUNCE_MS + 200);
    expect(mockRoomSeat.updateMany).not.toHaveBeenCalled();
  }, 15000);

  it('does not clear seats when the same user still has another socket in the room', async () => {
    mockRoom.findUnique.mockResolvedValue(LIVE_ROOM_FOR_JOIN);
    mockUser.findMany.mockResolvedValue([
      {
        id: USER_ID,
        username: 'viewer',
        displayName: 'Viewer',
        avatar: '',
        hakaId: null,
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
    ]);

    const a = connectClient(makeToken(USER_ID));
    await new Promise<void>((r) => {
      a.on('connect', r);
    });
    await new Promise<void>((r) => {
      a.emit('room:join', { roomId: ROOM_ID }, () => r());
    });

    const b = connectClient(makeToken(USER_ID));
    await new Promise<void>((r) => {
      b.on('connect', r);
    });
    await new Promise<void>((r) => {
      b.emit('room:join', { roomId: ROOM_ID }, () => r());
    });

    const userLeftOnB = jest.fn();
    b.on('user.left', userLeftOnB);

    mockRoomSeat.updateMany.mockClear();
    a.close();
    await sleep(400);
    expect(mockRoomSeat.updateMany).not.toHaveBeenCalled();
    expect(userLeftOnB).not.toHaveBeenCalled();

    b.close();
    await sleep(400);
    expect(mockRoomSeat.updateMany).not.toHaveBeenCalled();

    await sleep(FULL_LEAVE_DEBOUNCE_MS + 200);
    expect(mockRoomSeat.updateMany).toHaveBeenCalled();

    await sleep(100);
  }, 25000);

  it('cancels debounced full leave when the user room:joins again before the window', async () => {
    mockRoom.findUnique.mockResolvedValue(LIVE_ROOM_FOR_JOIN);
    mockUser.findMany.mockResolvedValue([
      {
        id: USER_ID,
        username: 'viewer',
        displayName: 'Viewer',
        avatar: '',
        hakaId: null,
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        storeItems: [],
      },
    ]);

    const first = connectClient(makeToken(USER_ID));
    await new Promise<void>((r) => {
      first.on('connect', r);
    });
    await new Promise<void>((r) => {
      first.emit('room:join', { roomId: ROOM_ID }, () => r());
    });

    mockRoomSeat.updateMany.mockClear();
    first.close();
    await sleep(500);

    const second = connectClient(makeToken(USER_ID));
    await new Promise<void>((r) => {
      second.on('connect', r);
    });
    await new Promise<void>((r) => {
      second.emit('room:join', { roomId: ROOM_ID }, () => r());
    });

    await sleep(FULL_LEAVE_DEBOUNCE_MS + 200);
    expect(mockRoomSeat.updateMany).not.toHaveBeenCalled();

    second.close();
    await sleep(FULL_LEAVE_DEBOUNCE_MS + 200);
    expect(mockRoomSeat.updateMany).toHaveBeenCalled();

    await sleep(100);
  }, 35000);
});

// ── seat:take / seat:leave ────────────────────────────────────────────────────

describe('seat:take / seat:leave', () => {
  it('takes an empty seat and broadcasts seat.updated', (done) => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live', micConfig: 5, hostId: HOST_ID });
    mockQueryRaw.$queryRaw.mockResolvedValue([{ id: 'seat-2', user_id: null, is_locked: false }]);
    mockRoomSeat.update.mockResolvedValue({
      position: 2, userId: USER_ID, isLocked: false, isMuted: false,
      user: { id: USER_ID, username: 'viewer', displayName: 'Viewer', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
    });

    const client = connectClient(makeToken());
    client.on('connect', () => {
      client.emit('room:join', { roomId: ROOM_ID }, () => {
        client.on('seat.updated', (data) => {
          expect(data.position).toBe(2);
          expect(data.userId).toBe(USER_ID);
          client.close();
          done();
        });

        client.emit('seat:take', { roomId: ROOM_ID, position: 2 }, (ack: any) => {
          expect(ack.ok).toBe(true);
        });
      });
    });
  });

  it('rejects taking a locked seat', (done) => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live', micConfig: 5, hostId: HOST_ID });
    mockQueryRaw.$queryRaw.mockResolvedValue([{ id: 'seat-3', user_id: null, is_locked: true }]);

    const client = connectClient(makeToken());
    client.on('connect', () => {
      client.emit('seat:take', { roomId: ROOM_ID, position: 3 }, (ack: any) => {
        expect(ack.error).toContain('locked');
        client.close();
        done();
      });
    });
  });

  it('leaves a seat and broadcasts seat.updated with null user', (done) => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live' });
    mockQueryRaw.$queryRaw.mockResolvedValue([{ user_id: USER_ID }]);
    mockRoomSeat.update.mockResolvedValue({ position: 2, userId: null, isLocked: false, isMuted: false });

    // Active calculator session exists; leaving mic should end it
    mockCalcSession.findFirst.mockResolvedValue({ id: 'calc-1', roomId: ROOM_ID, status: 'active' });
    mockCalcSession.findUnique.mockResolvedValue({ id: 'calc-1', roomId: ROOM_ID, status: 'active' });
    mockCalcSession.update.mockResolvedValue({ id: 'calc-1', roomId: ROOM_ID, status: 'ended' });
    mockCalcSeatScore.findMany.mockResolvedValue([]);

    const client = connectClient(makeToken());
    client.on('connect', () => {
      client.emit('room:join', { roomId: ROOM_ID }, () => {
        let sawSeatUpdated = false;
        let sawCalcEnded = false;
        const maybeDone = () => {
          if (sawSeatUpdated && sawCalcEnded) {
            client.close();
            done();
          }
        };

        client.on('seat.updated', (data) => {
          expect(data.position).toBe(2);
          expect(data.userId).toBeNull();
          sawSeatUpdated = true;
          maybeDone();
        });

        client.on('calculator:ended', (payload: any) => {
          expect(payload.sessionId).toBe('calc-1');
          expect(Array.isArray(payload.scores)).toBe(true);
          sawCalcEnded = true;
          maybeDone();
        });

        client.emit('seat:leave', { roomId: ROOM_ID, position: 2 }, (ack: any) => {
          expect(ack.ok).toBe(true);
        });
      });
    });
  });
});

// ── seat:apply (apply-for-mic queue) ───────────────────────────────────────────

describe('seat:apply (queue)', () => {
  it('notifies host via user:<id> room even if host is not joined to roomId', (done) => {
    // Applicant applies in a live room with applyForMic enabled.
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live', hostId: HOST_ID, applyForMic: true });
    // Applicant is not seated
    mockRoomSeat.findFirst.mockResolvedValue(null);
    // Applicant user lookup (minimal fields used by serializeUserSummary + applicant payload)
    mockUser.findUnique.mockResolvedValue({
      id: USER_ID,
      username: 'viewer',
      displayName: 'Viewer',
      avatar: '',
      hakaId: 'HAKA0001',
      activeSpecialId: null,
      activeSpecialIdLevel: null,
      activeSpecialIdExpiresAt: null,
      equippedFrame: null,
      storeItems: [],
      role: 'normal_user',
      hostType: '',
      isVerified: false,
      gender: 'unknown',
      dateOfBirth: null,
      country: 'NG',
      level: { richLevel: 1, charmLevel: 2 },
      tags: [],
    });
    // Redis: no duplicate apply
    const redisHexists = (require('../config/redis').redis.hexists as jest.Mock);
    redisHexists.mockResolvedValueOnce(0);

    // Host connects but does NOT room:join (so won't be in io.to(roomId) room).
    const host = connectClient(makeToken(HOST_ID, 'host'));
    let applicant: ClientSocket | null = null;
    host.on('connect', () => {
      host.on('seat.application.added', (payload: any) => {
        try {
          expect(payload?.applicant?.userId).toBe(USER_ID);
          host.close();
          applicant?.close();
          done();
        } catch (e) {
          host.close();
          applicant?.close();
          done(e as any);
        }
      });

      applicant = connectClient(makeToken(USER_ID, 'normal_user'));
      applicant.on('connect', () => {
        applicant?.emit('seat:apply', { roomId: ROOM_ID, position: null }, (ack: any) => {
          expect(ack?.ok).toBe(true);
          expect(ack?.queued).toBe(true);
        });
      });
    });
  });
});

// ── seat:lock / seat:kick (host only) ─────────────────────────────────────────

describe('seat:lock / seat:kick (host only)', () => {
  it('host can lock a seat', (done) => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID, status: 'live', micConfig: 5 });
    mockQueryRaw.$queryRaw.mockResolvedValue([{ id: 'seat-3' }]);
    mockRoomSeat.update.mockResolvedValue({ position: 3, userId: null, isLocked: true, isMuted: false });

    const client = connectClient(makeToken(HOST_ID));
    client.on('connect', () => {
      client.emit('room:join', { roomId: ROOM_ID }, () => {
        client.on('seat.updated', (data) => {
          expect(data.position).toBe(3);
          expect(data.isLocked).toBe(true);
          client.close();
          done();
        });

        client.emit('seat:lock', { roomId: ROOM_ID, position: 3, lock: true }, (ack: any) => {
          expect(ack.ok).toBe(true);
        });
      });
    });
  });

  it('non-host cannot lock a seat', (done) => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID, status: 'live' });

    const client = connectClient(makeToken(USER_ID));
    client.on('connect', () => {
      client.emit('seat:lock', { roomId: ROOM_ID, position: 3, lock: true }, (ack: any) => {
        expect(ack.error).toContain('host');
        client.close();
        done();
      });
    });
  });

  it('host can kick a user from seat', (done) => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, hostId: HOST_ID, status: 'live' });
    mockRoomSeat.findUnique.mockResolvedValue({ id: 'seat-2', roomId: ROOM_ID, position: 2, userId: USER_ID });
    mockQueryRaw.$queryRaw.mockResolvedValue([{ id: 'seat-2' }]);
    mockRoomSeat.update.mockResolvedValue({ position: 2, userId: null, isLocked: false, isMuted: false });
    mockBan.updateMany.mockResolvedValue({ count: 0 });
    mockBan.create.mockResolvedValue({ id: 'ban-1' });

    // Active calculator session exists; kick-from-mic should end it
    mockCalcSession.findFirst.mockResolvedValue({ id: 'calc-2', roomId: ROOM_ID, status: 'active' });
    mockCalcSession.findUnique.mockResolvedValue({ id: 'calc-2', roomId: ROOM_ID, status: 'active' });
    mockCalcSession.update.mockResolvedValue({ id: 'calc-2', roomId: ROOM_ID, status: 'ended' });
    mockCalcSeatScore.findMany.mockResolvedValue([]);

    const client = connectClient(makeToken(HOST_ID));
    client.on('connect', () => {
      client.emit('room:join', { roomId: ROOM_ID }, () => {
        let sawSeatUpdated = false;
        let sawCalcEnded = false;
        const maybeDone = () => {
          if (sawSeatUpdated && sawCalcEnded) {
            client.close();
            done();
          }
        };

        client.on('seat.updated', (data) => {
          expect(data.position).toBe(2);
          expect(data.userId).toBeNull();
          expect(mockBan.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                userId: USER_ID,
                adminId: HOST_ID,
                roomId: ROOM_ID,
                type: 'room',
                banType: 'temporary',
                isActive: true,
              }),
            }),
          );
          sawSeatUpdated = true;
          maybeDone();
        });

        client.on('calculator:ended', (payload: any) => {
          expect(payload.sessionId).toBe('calc-2');
          sawCalcEnded = true;
          maybeDone();
        });

        client.emit('seat:kick', { roomId: ROOM_ID, position: 2 }, (ack: any) => {
          expect(ack.ok).toBe(true);
        });
      });
    });
  });
});

// ── chat:message ──────────────────────────────────────────────────────────────

describe('chat:message', () => {
  it('broadcasts message.sent to room', (done) => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live' });
    mockRoom.update.mockResolvedValue({ viewerCount: 1 });
    mockRoomMessage.create.mockResolvedValue({
      id: 'msg-uuid-1',
      content: 'Hello room!',
      createdAt: new Date().toISOString(),
      sender: { id: USER_ID, username: 'viewer', displayName: 'Viewer', avatar: '', hakaId: null, activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
    });

    const client = connectClient(makeToken());
    client.on('connect', () => {
      client.emit('room:join', { roomId: ROOM_ID }, () => {
        client.on('message.sent', (data) => {
          expect(data.content).toBe('Hello room!');
          expect(data.sender.id).toBe(USER_ID);
          expect(data.id).toBeTruthy();
          client.close();
          done();
        });

        client.emit('chat:message', { roomId: ROOM_ID, content: 'Hello room!' }, (ack: any) => {
          expect(ack.ok).toBe(true);
        });
      });
    });
  });

  it('rejects empty messages', (done) => {
    const client = connectClient(makeToken());
    client.on('connect', () => {
      client.emit('chat:message', { roomId: ROOM_ID, content: '' }, (ack: any) => {
        expect(ack.error).toContain('empty');
        client.close();
        done();
      });
    });
  });

  it('rejects messages over 500 chars', (done) => {
    const client = connectClient(makeToken());
    client.on('connect', () => {
      client.emit('chat:message', { roomId: ROOM_ID, content: 'x'.repeat(501) }, (ack: any) => {
        expect(ack.error).toContain('too long');
        client.close();
        done();
      });
    });
  });
});
