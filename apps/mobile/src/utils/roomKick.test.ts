import { canKickRoomMember } from './roomKick';

const hostId = 'host-1';
const adminIds = new Set(['admin-1', 'admin-2']);

describe('canKickRoomMember', () => {
  it('returns false for self and room owner', () => {
    expect(
      canKickRoomMember({
        isHost: true,
        isRoomAdmin: false,
        targetUserId: hostId,
        hostId,
        roomAdminIds: adminIds,
        currentUserId: hostId,
      }),
    ).toBe(false);
    expect(
      canKickRoomMember({
        isHost: true,
        isRoomAdmin: false,
        targetUserId: hostId,
        hostId,
        roomAdminIds: adminIds,
        currentUserId: 'other',
      }),
    ).toBe(false);
  });

  it('allows host to kick room admins and listeners', () => {
    expect(
      canKickRoomMember({
        isHost: true,
        isRoomAdmin: false,
        targetUserId: 'admin-1',
        hostId,
        roomAdminIds: adminIds,
        currentUserId: hostId,
      }),
    ).toBe(true);
    expect(
      canKickRoomMember({
        isHost: true,
        isRoomAdmin: false,
        targetUserId: 'listener-1',
        hostId,
        roomAdminIds: adminIds,
        currentUserId: hostId,
      }),
    ).toBe(true);
  });

  it('allows room admin to kick listeners only', () => {
    expect(
      canKickRoomMember({
        isHost: false,
        isRoomAdmin: true,
        targetUserId: 'listener-1',
        hostId,
        roomAdminIds: adminIds,
        currentUserId: 'admin-1',
      }),
    ).toBe(true);
    expect(
      canKickRoomMember({
        isHost: false,
        isRoomAdmin: true,
        targetUserId: 'admin-2',
        hostId,
        roomAdminIds: adminIds,
        currentUserId: 'admin-1',
      }),
    ).toBe(false);
  });
});
