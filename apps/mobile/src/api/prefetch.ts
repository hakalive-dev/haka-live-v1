/**
 * Navigation prefetch: warm the React Query cache for a Room or DM the instant
 * the user taps, so the request flies during the navigation animation instead
 * of after the destination screen mounts.
 *
 * The destination screens read the SAME query via `queryClient.fetchQuery(...)`,
 * which dedupes against an in-flight prefetch (one request, shared) and returns
 * cached data immediately when it's still fresh — so a prefetched room/DM paints
 * with no network wait. The screens keep their own local state + realtime
 * mutation logic; only the initial fetch flows through the cache.
 */
import type { FetchQueryOptions } from '@tanstack/react-query';

import { queryClient } from './queryClient';
import { queryKeys } from './queryKeys';
import { roomsApi } from './rooms';
import { chatApi } from './chat';
import type { Room, DirectMessage, PaginatedResult } from '@/types';

/** Short enough that a revisit refetches live data; long enough to cover the
 * prefetch→mount gap (a navigation animation is well under a second). */
const ROOM_DETAIL_STALE_MS = 15_000;
const DM_MESSAGES_STALE_MS = 15_000;
/** RoomMember rows change only on explicit join/unjoin — cache across revisits. */
const ROOM_MEMBERSHIP_STALE_MS = 30 * 60_000;

export function roomDetailQuery(roomId: string): FetchQueryOptions<Room> {
  return {
    queryKey: queryKeys.rooms.detail(roomId),
    queryFn: () => roomsApi.detail(roomId),
    staleTime: ROOM_DETAIL_STALE_MS,
  };
}

export function roomMembershipQuery(
  roomId: string,
): FetchQueryOptions<{ isMember: boolean; isRoomAdmin: boolean }> {
  return {
    queryKey: queryKeys.rooms.membership(roomId),
    queryFn: () => roomsApi.isMember(roomId),
    staleTime: ROOM_MEMBERSHIP_STALE_MS,
  };
}

export function dmMessagesQuery(
  userId: string,
): FetchQueryOptions<PaginatedResult<DirectMessage>> {
  return {
    queryKey: queryKeys.chat.dmMessages(userId),
    queryFn: () => chatApi.getDMMessages(userId),
    staleTime: DM_MESSAGES_STALE_MS,
  };
}

/** Fire-and-forget warm-up for a room the user is about to open. */
export function prefetchRoomDetail(roomId: string): void {
  void queryClient.prefetchQuery(roomDetailQuery(roomId));
}

/** Fire-and-forget warm-up for a DM thread the user is about to open. */
export function prefetchDMMessages(userId: string): void {
  void queryClient.prefetchQuery(dmMessagesQuery(userId));
}
