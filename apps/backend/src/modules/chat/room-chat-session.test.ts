/**
 * Per-user ephemeral room chat session (Redis watermark).
 */

jest.mock('../../config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

import { redis } from '../../config/redis';
import {
  clearUserRoomChatSession,
  effectiveRoomChatSince,
  getOrCreateUserRoomChatSince,
  userRoomChatSinceKey,
} from './room-chat-session';

const mockRedisGet = redis.get as jest.Mock;
const mockRedisSet = redis.set as jest.Mock;
const mockRedisDel = redis.del as jest.Mock;

describe('room-chat-session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreateUserRoomChatSince', () => {
    it('returns existing watermark when Redis key is set', async () => {
      const ts = Date.now() - 60_000;
      mockRedisGet.mockResolvedValueOnce(String(ts));

      const since = await getOrCreateUserRoomChatSince('room-1', 'user-1');
      expect(since.getTime()).toBe(ts);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('creates a new watermark when key is missing', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisSet.mockResolvedValueOnce('OK');

      const before = Date.now();
      const since = await getOrCreateUserRoomChatSince('room-1', 'user-1');
      const after = Date.now();

      expect(since.getTime()).toBeGreaterThanOrEqual(before);
      expect(since.getTime()).toBeLessThanOrEqual(after);
      expect(mockRedisSet).toHaveBeenCalledWith(
        userRoomChatSinceKey('room-1', 'user-1'),
        expect.any(String),
        'EX',
        86400,
      );
    });
  });

  describe('clearUserRoomChatSession', () => {
    it('deletes the Redis key', async () => {
      mockRedisDel.mockResolvedValueOnce(1);
      await clearUserRoomChatSession('room-1', 'user-1');
      expect(mockRedisDel).toHaveBeenCalledWith(userRoomChatSinceKey('room-1', 'user-1'));
    });
  });

  describe('effectiveRoomChatSince', () => {
    it('uses the later of room clear and user session', () => {
      const roomClear = new Date('2026-01-02T00:00:00Z');
      const userSince = new Date('2026-01-01T00:00:00Z');
      expect(effectiveRoomChatSince(roomClear, userSince)).toEqual(roomClear);
      expect(effectiveRoomChatSince(null, userSince)).toEqual(userSince);
    });
  });
});
