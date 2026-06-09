/**
 * Room image message — service unit tests + HTTP integration tests.
 * Prisma, storage, sockets, and moderation checks are mocked.
 */

jest.mock('../../config/firebase', () => ({
  firebaseAdmin: { auth: () => ({ verifyIdToken: jest.fn() }) },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    room: { findUnique: jest.fn() },
    roomMessage: { create: jest.fn() },
    user: { findUnique: jest.fn() },
    directMessage: { create: jest.fn() },
    blockedUser: { findFirst: jest.fn().mockResolvedValue(null) },
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    follow: { findFirst: jest.fn().mockResolvedValue(null) },
    ban: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    accountRisk: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

jest.mock('../../utils/storage', () => ({
  uploadToStorage: jest.fn(),
  resolvePublicAssetUrl: (url: string) => url,
}));

jest.mock('../../config/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({ remove: jest.fn().mockResolvedValue({ error: null }) })),
    },
  },
}));

jest.mock('../../sockets', () => ({
  getIO: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
}));

jest.mock('./haka-team-guard', () => ({
  assertCannotReplyToHakaTeam: jest.fn(),
}));

jest.mock('./chat.push', () => ({
  notifyDmRecipient: jest.fn().mockResolvedValue(undefined),
  notifyRoomChatRecipients: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { uploadToStorage } from '../../utils/storage';
import { supabase } from '../../config/supabase';
import { sendDMImageMessage, sendRoomImageMessage } from './chat.service';
import app from '../../app';

const mockRoom = prisma.room as unknown as { findUnique: jest.Mock };
const mockRoomMessage = prisma.roomMessage as unknown as { create: jest.Mock };
const mockUser = prisma.user as unknown as { findUnique: jest.Mock };
const mockDirectMessage = prisma.directMessage as unknown as { create: jest.Mock };
const mockUpload = uploadToStorage as unknown as jest.Mock;
const mockFrom = (supabase as unknown as { storage: { from: jest.Mock } }).storage.from;

const SENDER = 'sender-uuid';
const RECIPIENT = 'recipient-uuid';
const ROOM_ID = 'room-uuid';
const senderSummary = {
  id: SENDER,
  username: 'a',
  displayName: 'Alice',
  avatar: '',
  hakaId: 'HK1',
  activeSpecialId: null,
  activeSpecialIdLevel: null,
  activeSpecialIdExpiresAt: null,
  storeItems: [],
};
const recipientSummary = {
  id: RECIPIENT,
  username: 'b',
  displayName: 'Bob',
  avatar: '',
  hakaId: 'HK2',
  activeSpecialId: null,
  activeSpecialIdLevel: null,
  activeSpecialIdExpiresAt: null,
  storeItems: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockResolvedValue('https://cdn.example.com/room-chat-images/rooms/room-uuid/file.jpg');
});

describe('sendRoomImageMessage', () => {
  it('uploads the buffer, persists a message, and returns a serialized record', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live' });
    mockRoomMessage.create.mockResolvedValue({
      id: 'msg-1',
      content: 'hi',
      type: 'image',
      mediaUrl: 'https://cdn.example.com/room-chat-images/rooms/room-uuid/file.jpg',
      createdAt: new Date(),
      sender: senderSummary,
    });

    const buffer = Buffer.from([0xff, 0xd8, 0xff]);
    const result = await sendRoomImageMessage(SENDER, ROOM_ID, buffer, 'photo.jpg', 'image/jpeg', 'hi');

    expect(mockUpload).toHaveBeenCalledWith(
      buffer,
      expect.stringMatching(/^rooms\/room-uuid\/[0-9a-f-]+\.jpg$/),
      'image/jpeg',
      'room-chat-images',
      undefined,
      expect.objectContaining({
        resize: expect.objectContaining({ maxDim: 1280 }),
        cacheControl: '31536000',
        immutable: true,
      }),
    );
    expect(mockRoomMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        roomId: ROOM_ID,
        senderId: SENDER,
        content: 'hi',
        type: 'image',
        mediaUrl: 'https://cdn.example.com/room-chat-images/rooms/room-uuid/file.jpg',
      }),
    }));
    expect(result.type).toBe('image');
    expect(result.mediaUrl).toContain('/room-chat-images/');
  });

  it('stores null caption when none supplied', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live' });
    mockRoomMessage.create.mockResolvedValue({
      id: 'msg-2', content: null, type: 'image',
      mediaUrl: 'https://cdn.example.com/x.jpg', createdAt: new Date(), sender: senderSummary,
    });

    await sendRoomImageMessage(SENDER, ROOM_ID, Buffer.from([1]), 'x.png', 'image/png');
    expect(mockRoomMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: null }),
    }));
  });

  it('rejects when the room does not exist', async () => {
    mockRoom.findUnique.mockResolvedValue(null);
    await expect(
      sendRoomImageMessage(SENDER, ROOM_ID, Buffer.from([1]), 'x.jpg', 'image/jpeg'),
    ).rejects.toThrow('Room not found');
  });

  it('rejects when the room has ended', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'ended' });
    await expect(
      sendRoomImageMessage(SENDER, ROOM_ID, Buffer.from([1]), 'x.jpg', 'image/jpeg'),
    ).rejects.toThrow('Room has ended');
  });

  it('rejects captions longer than 500 chars', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live' });
    await expect(
      sendRoomImageMessage(SENDER, ROOM_ID, Buffer.from([1]), 'x.jpg', 'image/jpeg', 'a'.repeat(501)),
    ).rejects.toThrow('Message too long');
  });

  it('propagates upload errors without creating a message', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live' });
    mockUpload.mockRejectedValueOnce(new Error('Storage upload failed: boom'));

    await expect(
      sendRoomImageMessage(SENDER, ROOM_ID, Buffer.from([0xff]), 'x.jpg', 'image/jpeg', 'hi'),
    ).rejects.toThrow('Storage upload failed');

    expect(mockRoomMessage.create).not.toHaveBeenCalled();
  });

  it('cleans up the uploaded object when DB persist fails', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live' });
    mockRoomMessage.create.mockRejectedValueOnce(new Error('DB exploded'));

    await expect(
      sendRoomImageMessage(SENDER, ROOM_ID, Buffer.from([0xff]), 'x.jpg', 'image/jpeg'),
    ).rejects.toThrow('DB exploded');

    expect(mockFrom).toHaveBeenCalledWith('room-chat-images');
  });
});

describe('sendDMImageMessage', () => {
  beforeEach(() => {
    mockUser.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === SENDER) return Promise.resolve({ id: SENDER, isMuted: false });
      if (where.id === RECIPIENT) return Promise.resolve({ id: RECIPIENT });
      return Promise.resolve(null);
    });
  });

  it('uploads to dm-chat-images and returns messageType image with mediaUrl', async () => {
    const dmUrl =
      'https://cdn.example.com/storage/v1/object/public/dm-chat-images/dms/a-b/file.jpg';
    mockUpload.mockResolvedValueOnce(dmUrl);
    mockDirectMessage.create.mockResolvedValue({
      id: 'dm-1',
      content: '',
      isRead: false,
      createdAt: new Date(),
      messageType: 'image',
      mediaUrl: dmUrl,
      giftId: null,
      giftName: '',
      giftImage: '',
      giftIcon: '',
      giftQty: 0,
      giftCoinCost: 0,
      sender: senderSummary,
      recipient: recipientSummary,
    });

    const buffer = Buffer.from([0xff, 0xd8, 0xff]);
    const result = await sendDMImageMessage(
      SENDER,
      RECIPIENT,
      buffer,
      'photo.jpg',
      'image/jpeg',
    );

    const pair = [SENDER, RECIPIENT].sort().join('-');
    expect(mockUpload).toHaveBeenCalledWith(
      buffer,
      expect.stringMatching(new RegExp(`^dms/${pair}/[0-9a-f-]+\\.jpg$`)),
      'image/jpeg',
      'dm-chat-images',
      undefined,
      expect.objectContaining({
        resize: expect.objectContaining({ maxDim: 1280 }),
        cacheControl: '31536000',
        immutable: true,
      }),
    );
    expect(result.messageType).toBe('image');
    expect(result.mediaUrl).toContain('/dm-chat-images/');
  });

  it('cleans up dm-chat-images object when DB persist fails', async () => {
    mockDirectMessage.create.mockRejectedValueOnce(new Error('DB exploded'));
    await expect(
      sendDMImageMessage(SENDER, RECIPIENT, Buffer.from([0xff]), 'x.jpg', 'image/jpeg'),
    ).rejects.toThrow('DB exploded');
    expect(mockFrom).toHaveBeenCalledWith('dm-chat-images');
  });
});

function makeToken(userId = SENDER) {
  return jwt.sign(
    { sub: userId, role: 'normal_user' },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: '15m' },
  );
}

describe('POST /api/v1/chat/rooms/:roomId/images', () => {
  beforeEach(() => {
    mockRoom.findUnique.mockReset();
    mockRoomMessage.create.mockReset();
  });

  it('201 on valid JPEG upload', async () => {
    mockRoom.findUnique.mockResolvedValue({ id: ROOM_ID, status: 'live' });
    mockRoomMessage.create.mockResolvedValue({
      id: 'msg-http-1',
      content: 'hi',
      type: 'image',
      mediaUrl: 'https://cdn.example.com/room-chat-images/rooms/room-uuid/x.jpg',
      createdAt: new Date(),
      sender: senderSummary,
    });

    const res = await request(app)
      .post(`/api/v1/chat/rooms/${ROOM_ID}/images`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .field('caption', 'hi')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'x.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('image');
    expect(res.body.data.mediaUrl).toBeTruthy();
  });

  it('400 when no file is attached', async () => {
    const res = await request(app)
      .post(`/api/v1/chat/rooms/${ROOM_ID}/images`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Image file is required');
  });

  it('400 on disallowed MIME (PDF)', async () => {
    const res = await request(app)
      .post(`/api/v1/chat/rooms/${ROOM_ID}/images`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .attach('file', Buffer.from([0x25, 0x50, 0x44, 0x46]), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Only JPEG, PNG, or WebP');
  });

  it('400 when file exceeds 5 MB', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    const res = await request(app)
      .post(`/api/v1/chat/rooms/${ROOM_ID}/images`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .attach('file', big, { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('File too large');
  });

  it('401 without auth token', async () => {
    const res = await request(app)
      .post(`/api/v1/chat/rooms/${ROOM_ID}/images`)
      .attach('file', Buffer.from([0xff, 0xd8]), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/chat/conversations/:userId/images', () => {
  beforeEach(() => {
    mockUser.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === SENDER) return Promise.resolve({ id: SENDER, isMuted: false });
      if (where.id === RECIPIENT) return Promise.resolve({ id: RECIPIENT });
      return Promise.resolve(null);
    });
    mockDirectMessage.create.mockReset();
  });

  it('201 on valid JPEG upload with public dm-chat-images mediaUrl', async () => {
    const dmUrl =
      'https://cdn.example.com/storage/v1/object/public/dm-chat-images/dms/a-b/x.jpg';
    mockUpload.mockResolvedValueOnce(dmUrl);
    mockDirectMessage.create.mockResolvedValue({
      id: 'dm-http-1',
      content: '',
      isRead: false,
      createdAt: new Date(),
      messageType: 'image',
      mediaUrl: dmUrl,
      giftId: null,
      giftName: '',
      giftImage: '',
      giftIcon: '',
      giftQty: 0,
      giftCoinCost: 0,
      sender: senderSummary,
      recipient: recipientSummary,
    });

    const res = await request(app)
      .post(`/api/v1/chat/conversations/${RECIPIENT}/images`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .attach('file', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'x.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.messageType).toBe('image');
    expect(res.body.data.mediaUrl).toContain('/dm-chat-images/');
  });
});
