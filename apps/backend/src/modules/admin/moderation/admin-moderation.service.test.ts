/**
 * Room ban kick — admin-moderation.service.ts
 *
 * Verifies that `createRoomBan`:
 *   - inserts a Ban row with type='room'
 *   - vacates the user's seat in that room (if any)
 *   - emits `seat.updated` and `room:kicked` via the Socket.io adapter
 *
 * Uses Prisma mocks + a hand-rolled Socket.io stub.
 */

jest.mock('../../../config/prisma', () => {
  const db: any = {
    user: { findUnique: jest.fn() },
    specialIdInventory: { findFirst: jest.fn() },
    room: { findUnique: jest.fn() },
    ban: {
      findFirst: jest.fn().mockResolvedValue(null),
      create:    jest.fn(),
    },
    roomSeat: {
      findMany:   jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return { prisma: db };
});

const emit          = jest.fn();
const ioToReturn    = { emit };
const adapterRooms  = new Map<string, Set<string>>();
const sockets       = new Map<string, { leave: jest.Mock }>();
const ioStub: any = {
  to: jest.fn(() => ioToReturn),
  sockets: {
    adapter: { rooms: adapterRooms },
    sockets,
  },
};

jest.mock('../../../sockets', () => ({
  getIO: () => ioStub,
}));

import { prisma } from '../../../config/prisma';
import { createRoomBan } from './admin-moderation.service';

const mockUser = prisma.user as unknown as { findUnique: jest.Mock };
const mockBan  = prisma.ban as unknown as { findFirst: jest.Mock; create: jest.Mock };
const mockRoom = prisma.room as unknown as { findUnique: jest.Mock };
const mockSeat = prisma.roomSeat as unknown as { findMany: jest.Mock; updateMany: jest.Mock };

describe('createRoomBan kick flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    adapterRooms.clear();
    sockets.clear();
  });

  it('vacates the seat, kicks the socket out of the room, and emits room:kicked', async () => {
    // resolveUserByIdentifier first looks up by hakaId.
    mockUser.findUnique.mockResolvedValueOnce({ id: 'u-1', hakaId: 'haka-1' });
    mockRoom.findUnique.mockResolvedValueOnce({ id: 'room-1', hostId: 'host-1' });
    mockBan.create.mockResolvedValueOnce({
      id: 'ban-1', userId: 'u-1', roomId: 'room-1', type: 'room', isActive: true,
    });

    // The user occupies seat #2.
    mockSeat.findMany
      .mockResolvedValueOnce([{ id: 'seat-1', position: 2 }]) // first call: occupiedSeats
      .mockResolvedValueOnce([{                              // second call: refreshed seats
        id: 'seat-1', position: 2, userId: null, isMuted: false,
        user: null,
      }]);

    // Pretend the user has one live socket joined to the room.
    const leave = jest.fn();
    sockets.set('sock-1', { leave });
    adapterRooms.set('user:u-1', new Set(['sock-1']));

    const ban = await createRoomBan('admin-1', 'haka-1', 'room-1', 'spam', '127.0.0.1');
    expect(ban.id).toBe('ban-1');

    // Seat was vacated.
    expect(mockSeat.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', userId: 'u-1' },
      data:  { userId: null, isMuted: false },
    });

    // Socket was forcibly removed from the room.
    expect(leave).toHaveBeenCalledWith('room-1');

    // The expected events fired.
    const targets = (ioStub.to as jest.Mock).mock.calls.map((c) => c[0]);
    expect(targets).toEqual(expect.arrayContaining(['room-1', 'user:u-1']));
    const events = emit.mock.calls.map((c) => c[0]);
    expect(events).toEqual(expect.arrayContaining(['seat.updated', 'room:kicked']));
  });

  it('still creates the ban when the user has no seat and no live socket', async () => {
    mockUser.findUnique.mockResolvedValueOnce({ id: 'u-2', hakaId: 'haka-2' });
    mockRoom.findUnique.mockResolvedValueOnce({ id: 'room-2', hostId: 'host-2' });
    mockBan.create.mockResolvedValueOnce({ id: 'ban-2' });
    mockSeat.findMany.mockResolvedValueOnce([]); // not seated
    // No adapterRooms entry ⇒ no sockets to evict.

    const ban = await createRoomBan('admin-1', 'haka-2', 'room-2', 'spam', '127.0.0.1');
    expect(ban.id).toBe('ban-2');
    expect(mockSeat.updateMany).not.toHaveBeenCalled();
  });
});
