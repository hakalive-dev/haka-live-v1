/**
 * Mute enforcement — chat.service.ts
 *
 * Verifies that a user with `User.isMuted = true` cannot send room messages
 * or DMs. Uses Prisma mocks so the test does not require a live database.
 */

jest.mock('../../config/prisma', () => {
  const db: any = {
    user: { findUnique: jest.fn() },
    room: { findUnique: jest.fn() },
    roomMessage: { create: jest.fn() },
    directMessage: { create: jest.fn() },
    blockedUser: { findFirst: jest.fn().mockResolvedValue(null) },
    userSettings: { findUnique: jest.fn().mockResolvedValue({ whoCanMessage: 'everyone' }) },
    follow: { findFirst: jest.fn() },
  };
  return { prisma: db };
});

jest.mock('../../config/supabase', () => ({ supabase: null }));

import { prisma } from '../../config/prisma';
import { sendRoomMessage, sendDM } from './chat.service';

const mockUser     = prisma.user as unknown as { findUnique: jest.Mock };
const mockRoom     = prisma.room as unknown as { findUnique: jest.Mock };
const mockRoomMsg  = prisma.roomMessage as unknown as { create: jest.Mock };
const mockDM       = prisma.directMessage as unknown as { create: jest.Mock };

describe('chat.service mute enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendRoomMessage', () => {
    it('rejects messages from a muted user with 403', async () => {
      mockUser.findUnique.mockResolvedValueOnce({ isMuted: true });

      await expect(
        sendRoomMessage('user-1', 'room-1', 'hello', 'text'),
      ).rejects.toMatchObject({ message: 'You are muted', statusCode: 403 });

      expect(mockRoom.findUnique).not.toHaveBeenCalled();
      expect(mockRoomMsg.create).not.toHaveBeenCalled();
    });

    it('lets a non-muted user send', async () => {
      mockUser.findUnique.mockResolvedValueOnce({ isMuted: false });
      mockRoom.findUnique.mockResolvedValueOnce({ id: 'room-1', status: 'live' });
      mockRoomMsg.create.mockResolvedValueOnce({
        id: 'm-1', content: 'hello', type: 'text', mediaUrl: null,
        createdAt: new Date(), sender: null,
      });

      const out = await sendRoomMessage('user-1', 'room-1', 'hello', 'text');
      expect(out.id).toBe('m-1');
      expect(mockRoomMsg.create).toHaveBeenCalledTimes(1);
    });

    it('skips the mute check for system gift notices (server-originated)', async () => {
      mockRoom.findUnique.mockResolvedValueOnce({ id: 'room-1', status: 'live' });
      mockRoomMsg.create.mockResolvedValueOnce({
        id: 'm-2', content: 'gift!', type: 'gift_notice', mediaUrl: null,
        createdAt: new Date(), sender: null,
      });

      await sendRoomMessage('user-1', 'room-1', 'gift!', 'gift_notice');
      // The mute-check guard is skipped for gift_notice/system, so user.findUnique
      // should not be called from the mute branch.
      expect(mockUser.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('sendDM', () => {
    it('rejects DMs from a muted user with 403', async () => {
      mockUser.findUnique.mockResolvedValueOnce({ isMuted: true });

      await expect(
        sendDM('user-1', 'user-2', 'hi'),
      ).rejects.toMatchObject({ message: 'You are muted', statusCode: 403 });

      expect(mockDM.create).not.toHaveBeenCalled();
    });
  });
});
