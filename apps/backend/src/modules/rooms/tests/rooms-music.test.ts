import { getMusicQueue, addMusicTrack, removeMusicTrack, reorderMusicQueue, advanceMusicTrack, setMusicLoop } from '../rooms.service';
import { prisma } from '../../../config/prisma';
import { redis } from '../../../config/redis';

jest.mock('../../../config/prisma', () => ({ prisma: { roomMusicTrack: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn(), update: jest.fn(), findUnique: jest.fn() }, roomAdmin: { findFirst: jest.fn() }, room: { findUnique: jest.fn() }, $transaction: jest.fn() } }));
jest.mock('../../../config/redis', () => ({ redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() } }));

const mockRoom = { id: 'room-1', hostId: 'host-1', status: 'live' };
const mockTrack = (pos: number) => ({ id: `track-${pos}`, name: `Song ${pos}`, url: `https://s3/song${pos}.mp3`, position: pos });

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.room.findUnique as jest.Mock).mockResolvedValue(mockRoom);
  (prisma.roomAdmin.findFirst as jest.Mock).mockResolvedValue(null);
  (redis.get as jest.Mock).mockResolvedValue(null);
  (redis.set as jest.Mock).mockResolvedValue('OK');
  (redis.del as jest.Mock).mockResolvedValue(1);
});

describe('getMusicQueue', () => {
  it('returns tracks, currentIndex and loopQueue', async () => {
    (prisma.roomMusicTrack.findMany as jest.Mock).mockResolvedValue([mockTrack(1), mockTrack(2)]);
    (redis.get as jest.Mock).mockImplementation((key: string) => {
      if (key.endsWith(':music:loop')) return Promise.resolve('0');
      if (key.endsWith(':music:index')) return Promise.resolve('1');
      return Promise.resolve(null);
    });
    const result = await getMusicQueue('room-1', 'host-1');
    expect(result.tracks).toHaveLength(2);
    expect(result.currentIndex).toBe(1);
    expect(result.loopQueue).toBe(false);
  });

  it('throws 403 if requester is not host or admin', async () => {
    await expect(getMusicQueue('room-1', 'other-user')).rejects.toMatchObject({ status: 403 });
  });
});

describe('addMusicTrack', () => {
  it('appends track at next position', async () => {
    (prisma.roomMusicTrack.findFirst as jest.Mock).mockResolvedValue({ position: 2 });
    (prisma.roomMusicTrack.create as jest.Mock).mockResolvedValue(mockTrack(3));
    const track = await addMusicTrack('room-1', 'host-1', 'https://s3/song3.mp3', 'Song 3');
    expect(prisma.roomMusicTrack.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 3 }) }),
    );
    expect(track.position).toBe(3);
  });

  it('sets Redis index to 0 when first track is added', async () => {
    (prisma.roomMusicTrack.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.roomMusicTrack.create as jest.Mock).mockResolvedValue(mockTrack(1));
    await addMusicTrack('room-1', 'host-1', 'https://s3/song1.mp3', 'Song 1');
    expect(redis.set).toHaveBeenCalledWith('room:room-1:music:index', '0');
  });

  it('throws 403 if requester is not host or admin', async () => {
    await expect(addMusicTrack('room-1', 'other-user', 'https://s3/song.mp3', 'Song')).rejects.toMatchObject({ status: 403 });
  });
});

describe('advanceMusicTrack', () => {
  it('advances to next track', async () => {
    (prisma.roomMusicTrack.findMany as jest.Mock).mockResolvedValue([mockTrack(1), mockTrack(2), mockTrack(3)]);
    (redis.get as jest.Mock).mockImplementation((key: string) => {
      if (key.endsWith(':music:loop')) return Promise.resolve('0');
      if (key.endsWith(':music:index')) return Promise.resolve('1');
      return Promise.resolve(null);
    });
    const result = await advanceMusicTrack('room-1', 'next');
    expect(result?.position).toBe(3);
    expect(redis.set).toHaveBeenCalledWith('room:room-1:music:index', '2');
  });

  it('wraps to first track at end of queue even when loop flag is off', async () => {
    (prisma.roomMusicTrack.findMany as jest.Mock).mockResolvedValue([mockTrack(1), mockTrack(2)]);
    (redis.get as jest.Mock).mockImplementation((key: string) => {
      if (key.endsWith(':music:loop')) return Promise.resolve('0');
      if (key.endsWith(':music:index')) return Promise.resolve('1');
      return Promise.resolve(null);
    });
    const result = await advanceMusicTrack('room-1', 'next');
    expect(result?.position).toBe(1);
    expect(redis.set).toHaveBeenCalledWith('room:room-1:music:index', '0');
  });

  it('wraps to first track when loop is enabled', async () => {
    (prisma.roomMusicTrack.findMany as jest.Mock).mockResolvedValue([mockTrack(1), mockTrack(2)]);
    (redis.get as jest.Mock).mockImplementation((key: string) => {
      if (key.endsWith(':music:loop')) return Promise.resolve('1');
      if (key.endsWith(':music:index')) return Promise.resolve('1');
      return Promise.resolve(null);
    });
    const result = await advanceMusicTrack('room-1', 'next');
    expect(result?.position).toBe(1);
    expect(redis.set).toHaveBeenCalledWith('room:room-1:music:index', '0');
  });

  it('goes to previous track', async () => {
    (prisma.roomMusicTrack.findMany as jest.Mock).mockResolvedValue([mockTrack(1), mockTrack(2), mockTrack(3)]);
    (redis.get as jest.Mock).mockImplementation((key: string) => {
      if (key.endsWith(':music:loop')) return Promise.resolve('0');
      if (key.endsWith(':music:index')) return Promise.resolve('2');
      return Promise.resolve(null);
    });
    const result = await advanceMusicTrack('room-1', 'prev');
    expect(result?.position).toBe(2);
    expect(redis.set).toHaveBeenCalledWith('room:room-1:music:index', '1');
  });

  it('returns null for empty queue', async () => {
    (prisma.roomMusicTrack.findMany as jest.Mock).mockResolvedValue([]);
    const result = await advanceMusicTrack('room-1', 'next');
    expect(result).toBeNull();
  });
});

describe('setMusicLoop', () => {
  it('sets loop flag in Redis', async () => {
    await setMusicLoop('room-1', 'host-1', true);
    expect(redis.set).toHaveBeenCalledWith('room:room-1:music:loop', '1');
  });

  it('sets loop flag to false in Redis', async () => {
    await setMusicLoop('room-1', 'host-1', false);
    expect(redis.set).toHaveBeenCalledWith('room:room-1:music:loop', '0');
  });
});
