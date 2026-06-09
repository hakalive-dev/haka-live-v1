import { normalizeSeatsUniqueOccupancy } from './roomSeats';
import type { Seat } from '@/types';

function seat(position: number, userId: string | null): Seat {
  return {
    position,
    userId,
    user: userId
      ? {
          id: userId,
          username: 'u',
          displayName: 'User',
          avatar: null,
          hakaId: null,
          equippedFrame: null,
        }
      : null,
    isLocked: false,
    isMuted: false,
  };
}

describe('normalizeSeatsUniqueOccupancy', () => {
  it('keeps only the lowest seat per user', () => {
    const host = 'host-1';
    const out = normalizeSeatsUniqueOccupancy([
      seat(1, host),
      seat(3, host),
      seat(2, 'other'),
    ]);
    expect(out.find((s) => s.position === 1)?.userId).toBe(host);
    expect(out.find((s) => s.position === 3)?.userId).toBeNull();
    expect(out.find((s) => s.position === 2)?.userId).toBe('other');
  });
});
