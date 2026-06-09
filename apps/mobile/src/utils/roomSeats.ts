import type { Seat } from '@/types';

/**
 * Client-side guard: at most one seat per user in room state (lowest position wins).
 */
export function normalizeSeatsUniqueOccupancy(seats: Seat[]): Seat[] {
  const keepPositionByUser = new Map<string, number>();

  for (const seat of seats) {
    const uid = seat.userId ?? seat.user?.id;
    if (!uid) continue;
    const prev = keepPositionByUser.get(uid);
    if (prev == null || seat.position < prev) {
      keepPositionByUser.set(uid, seat.position);
    }
  }

  return seats.map((seat) => {
    const uid = seat.userId ?? seat.user?.id;
    if (!uid) return seat;
    if (keepPositionByUser.get(uid) === seat.position) return seat;
    return {
      ...seat,
      userId: null,
      user: null,
      isMuted: false,
    };
  });
}
