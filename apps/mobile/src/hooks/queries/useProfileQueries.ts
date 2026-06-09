import { useQuery } from '@tanstack/react-query';

import { usersApi } from '@api/users';
import { giftsApi } from '@api/gifts';
import { leaderboardApi } from '@api/leaderboard';
import { queryKeys } from '@api/queryKeys';
import { queryClient } from '@api/queryClient';
import type { PublicUser } from '@/types';

/**
 * Public profile + its supporting panels (gifts, fans), cached by userId so
 * revisiting a recently-viewed profile paints instantly from cache and
 * refreshes in the background instead of re-blocking on the network.
 */
export function usePublicProfileQuery(userId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.profile.public(userId),
    queryFn: () => usersApi.profile(userId),
    staleTime: 60_000,
    enabled: (options?.enabled ?? true) && !!userId,
  });
}

export function useProfileGiftsQuery(userId: string, limit = 16) {
  return useQuery({
    queryKey: queryKeys.profile.gifts(userId),
    queryFn: () => giftsApi.received(userId, limit),
    staleTime: 120_000,
    enabled: !!userId,
  });
}

export function useProfileFansQuery(userId: string) {
  return useQuery({
    queryKey: queryKeys.profile.fans(userId),
    queryFn: () => leaderboardApi.getFans(userId, 'monthly', 3),
    staleTime: 120_000,
    enabled: !!userId,
  });
}

export function useFollowersQuery(userId: string) {
  return useQuery({
    queryKey: queryKeys.profile.followers(userId),
    queryFn: () => usersApi.followers(userId),
    staleTime: 60_000,
    enabled: !!userId,
  });
}

export function useFollowingQuery(userId: string) {
  return useQuery({
    queryKey: queryKeys.profile.following(userId),
    queryFn: () => usersApi.following(userId),
    staleTime: 60_000,
    enabled: !!userId,
  });
}

/** Imperatively patch the cached profile (e.g. optimistic follow toggle). */
export function setCachedPublicProfile(
  userId: string,
  updater: (prev: PublicUser) => PublicUser,
): void {
  queryClient.setQueryData<PublicUser>(queryKeys.profile.public(userId), (prev) =>
    prev ? updater(prev) : prev,
  );
}

/** Warm the profile cache during the navigation animation (call on tap). */
export function prefetchPublicProfile(userId: string): void {
  if (!userId) return;
  void queryClient.prefetchQuery({
    queryKey: queryKeys.profile.public(userId),
    queryFn: () => usersApi.profile(userId),
    staleTime: 60_000,
  });
}
