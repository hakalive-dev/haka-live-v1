jest.mock('../../config/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

import { redis } from '../../config/redis';
import {
  clearUserActiveRoom,
  getUserActiveRoomId,
  setUserActiveRoom,
  userActiveRoomKey,
} from './user-active-room';

const mockGet = redis.get as jest.Mock;
const mockSet = redis.set as jest.Mock;
const mockDel = redis.del as jest.Mock;

describe('user-active-room', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('userActiveRoomKey formats correctly', () => {
    expect(userActiveRoomKey('u1')).toBe('user:u1:activeRoom');
  });

  it('setUserActiveRoom writes TTL key', async () => {
    await setUserActiveRoom('u1', 'room-1');
    expect(mockSet).toHaveBeenCalledWith('user:u1:activeRoom', 'room-1', 'EX', 86400);
  });

  it('getUserActiveRoomId returns null for empty redis value', async () => {
    mockGet.mockResolvedValueOnce('');
    expect(await getUserActiveRoomId('u1')).toBeNull();
  });

  it('clearUserActiveRoom deletes when roomId matches', async () => {
    mockGet.mockResolvedValueOnce('room-1');
    await clearUserActiveRoom('u1', 'room-1');
    expect(mockDel).toHaveBeenCalledWith('user:u1:activeRoom');
  });

  it('clearUserActiveRoom skips delete when roomId mismatches', async () => {
    mockGet.mockResolvedValueOnce('room-other');
    await clearUserActiveRoom('u1', 'room-1');
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('clearUserActiveRoom deletes without roomId check when omitted', async () => {
    await clearUserActiveRoom('u1');
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockDel).toHaveBeenCalledWith('user:u1:activeRoom');
  });
});
