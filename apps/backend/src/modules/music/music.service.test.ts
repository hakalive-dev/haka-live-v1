jest.mock('../../config/prisma', () => ({
  prisma: {
    userMusicTrack: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { prisma } from '../../config/prisma';
import {
  getUserMusicLibrary,
  addToUserMusicLibrary,
  deleteFromUserMusicLibrary,
} from './music.service';

const mockUserMusicTrack = prisma.userMusicTrack as unknown as {
  findMany: jest.Mock;
  create: jest.Mock;
  findFirst: jest.Mock;
  delete: jest.Mock;
};

describe('getUserMusicLibrary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all tracks for the user sorted by createdAt desc', async () => {
    const tracks = [
      { id: 't1', userId: 'u1', name: 'Song A', url: 'https://cdn/a.mp3', mimeType: 'audio/mp3', createdAt: new Date(), updatedAt: new Date() },
    ];
    mockUserMusicTrack.findMany.mockResolvedValue(tracks);

    const result = await getUserMusicLibrary('u1');
    expect(result).toEqual(tracks);
    expect(mockUserMusicTrack.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'desc' },
    }));
  });

  it('filters by search query when provided', async () => {
    mockUserMusicTrack.findMany.mockResolvedValue([]);

    await getUserMusicLibrary('u1', 'chumma');
    expect(mockUserMusicTrack.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1', name: { contains: 'chumma', mode: 'insensitive' } },
    }));
  });
});

describe('addToUserMusicLibrary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a track record and returns it', async () => {
    const created = { id: 't2', userId: 'u1', name: 'New Song', url: 'https://cdn/new.mp3', mimeType: 'audio/mp3', createdAt: new Date(), updatedAt: new Date() };
    mockUserMusicTrack.create.mockResolvedValue(created);

    const result = await addToUserMusicLibrary('u1', 'https://cdn/new.mp3', 'New Song', 'audio/mp3');
    expect(result).toEqual(created);
    expect(mockUserMusicTrack.create).toHaveBeenCalledWith({
      data: { userId: 'u1', url: 'https://cdn/new.mp3', name: 'New Song', mimeType: 'audio/mp3' },
    });
  });
});

describe('deleteFromUserMusicLibrary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws 404 if track not found or does not belong to user', async () => {
    mockUserMusicTrack.findFirst.mockResolvedValue(null);

    await expect(deleteFromUserMusicLibrary('u1', 'bad-id')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deletes the track when it belongs to the user', async () => {
    const track = { id: 't1', userId: 'u1', name: 'Song', url: 'url', mimeType: '', createdAt: new Date(), updatedAt: new Date() };
    mockUserMusicTrack.findFirst.mockResolvedValue(track);
    mockUserMusicTrack.delete.mockResolvedValue(track);

    await deleteFromUserMusicLibrary('u1', 't1');
    expect(mockUserMusicTrack.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });
});
