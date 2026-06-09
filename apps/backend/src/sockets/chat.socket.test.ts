/**
 * Feature 6 — DM Socket.io Tests
 * Tests: personal room auto-join, dm:send, dm:read, new_dm delivery
 *
 * Uses a real Socket.io server on a random port — no HTTP mocking.
 * Prisma is mocked to avoid needing a real database.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
  },
}));

jest.mock('../config/prisma', () => ({
  prisma: {
    directMessage: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    blockedUser: { findFirst: jest.fn().mockResolvedValue(null) },
    follow: { findFirst: jest.fn().mockResolvedValue(null) },
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    ban: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    accountRisk: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

jest.mock('../config/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
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
import { prisma } from '../config/prisma';
import { authMiddleware } from './auth';
import { registerChatHandlers } from './chat.socket';

const mockDM = prisma.directMessage as unknown as {
  create: jest.Mock;
  updateMany: jest.Mock;
};
const mockUser = prisma.user as unknown as {
  findUnique: jest.Mock;
};

// ── Setup ─────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

const senderProfile = { id: USER_A, username: 'alice', displayName: 'Alice', avatar: '', hakaId: 'HK111', activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] };
const recipientProfile = { id: USER_B, username: 'bob', displayName: 'Bob', avatar: '', hakaId: 'HK222', activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] };

function makeToken(userId = USER_A) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
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
  registerChatHandlers(ioServer);

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

beforeEach(() => {
  jest.clearAllMocks();
});

// ── dm:send tests ────────────────────────────────────────────────────────────

describe('dm:send', () => {
  it('sends a DM and receives ack with message', (done) => {
    mockUser.findUnique.mockResolvedValue(recipientProfile);
    mockDM.create.mockResolvedValue({
      id: 'dm-1',
      content: 'Hello Bob!',
      isRead: false,
      createdAt: '2026-04-07T10:00:00Z',
      sender: senderProfile,
      recipient: recipientProfile,
    });

    const client = connectClient(makeToken(USER_A));
    client.on('connect', () => {
      client.emit('dm:send', { recipientId: USER_B, content: 'Hello Bob!' }, (ack: any) => {
        expect(ack.ok).toBe(true);
        expect(ack.message.content).toBe('Hello Bob!');
        client.close();
        done();
      });
    });
  });

  it('delivers new_dm to recipient in real-time', (done) => {
    mockUser.findUnique.mockResolvedValue(recipientProfile);
    mockDM.create.mockResolvedValue({
      id: 'dm-2',
      content: 'Hey there!',
      isRead: false,
      createdAt: '2026-04-07T10:01:00Z',
      sender: senderProfile,
      recipient: recipientProfile,
    });

    // Recipient connects first
    const recipient = connectClient(makeToken(USER_B));
    recipient.on('connect', () => {
      recipient.on('new_dm', (data) => {
        expect(data.content).toBe('Hey there!');
        expect(data.sender.id).toBe(USER_A);
        recipient.close();
        sender.close();
        done();
      });

      // Sender connects and sends DM
      const sender = connectClient(makeToken(USER_A));
      sender.on('connect', () => {
        sender.emit('dm:send', { recipientId: USER_B, content: 'Hey there!' }, () => {});
      });
    });
  });

  it('returns error for empty content', (done) => {
    mockUser.findUnique.mockResolvedValue(recipientProfile);
    mockDM.create.mockRejectedValue(new Error('Message cannot be empty'));

    const client = connectClient(makeToken(USER_A));
    client.on('connect', () => {
      client.emit('dm:send', { recipientId: USER_B, content: '' }, (ack: any) => {
        expect(ack.error).toBeTruthy();
        client.close();
        done();
      });
    });
  });
});

// ── dm:read tests ────────────────────────────────────────────────────────────

describe('dm:read', () => {
  it('marks messages as read', (done) => {
    mockDM.updateMany.mockResolvedValue({ count: 5 });

    const client = connectClient(makeToken(USER_A));
    client.on('connect', () => {
      client.emit('dm:read', { otherUserId: USER_B }, (ack: any) => {
        expect(ack.ok).toBe(true);
        expect(ack.markedRead).toBe(5);
        client.close();
        done();
      });
    });
  });
});

// ── Personal room auto-join ──────────────────────────────────────────────────

describe('personal room auto-join', () => {
  it('user receives events emitted to their personal room', (done) => {
    const client = connectClient(makeToken(USER_A));
    client.on('connect', () => {
      // Server emits directly to the personal room
      ioServer.to(`user:${USER_A}`).emit('new_dm', { id: 'test', content: 'server push' });
    });
    client.on('new_dm', (data) => {
      expect(data.content).toBe('server push');
      client.close();
      done();
    });
  });
});
