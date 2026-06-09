jest.mock('../../config/firebase', () => ({
  firebaseAdmin: { auth: () => ({ verifyIdToken: jest.fn() }) },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
}));

jest.mock('../../sockets', () => ({
  getIO: jest.fn(),
}));

jest.mock('../rooms/rooms.service', () => ({
  resolveUserActiveRoom: jest.fn(),
}));

import { prisma } from '../../config/prisma';
import { getIO } from '../../sockets';
import { resolveUserActiveRoom } from '../rooms/rooms.service';
import { getPresence } from './users.service';

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockResolveActiveRoom = resolveUserActiveRoom as jest.Mock;

describe('getPresence activeRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getIO as jest.Mock).mockReturnValue({
      sockets: { adapter: { rooms: new Map() } },
    });
  });

  it('returns activeRoom when user is in a live room', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'peer-1',
      lastSeenAt: new Date(),
      settings: { invisibleOnline: false },
    });
    mockResolveActiveRoom.mockResolvedValue({
      id: 'room-1',
      title: 'Party',
      roomMode: 'chat',
      isLocked: false,
      hostId: 'host-1',
    });

    const result = await getPresence('peer-1', 'viewer-1');
    expect(result.activeRoom).toEqual({
      id: 'room-1',
      title: 'Party',
      roomMode: 'chat',
      isLocked: false,
      hostId: 'host-1',
    });
    expect(mockResolveActiveRoom).toHaveBeenCalledWith('peer-1');
  });

  it('hides activeRoom when invisibleOnline is enabled for non-self viewer', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'peer-1',
      lastSeenAt: new Date(),
      settings: { invisibleOnline: true },
    });

    const result = await getPresence('peer-1', 'viewer-1');
    expect(result.activeRoom).toBeNull();
    expect(result.isOnline).toBe(false);
    expect(mockResolveActiveRoom).not.toHaveBeenCalled();
  });
});
