import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';

import { levelsApi } from '@api/levels';
import { queryKeys } from '@api/queryKeys';
import { queryClient } from '@api/queryClient';
import type { RootState } from '../../store';
import type { PublicUser, UserLevelInfo } from '@/types';

/** Shared Rich/Charm level source for LevelScreen, PublicProfile, and Profile tab. */
export function useUserLevelQuery(
  userId: string | undefined,
  options?: { enabled?: boolean; isOwn?: boolean },
) {
  const authUserId = useSelector((state: RootState) => state.auth.user?.id);
  const isOwn = options?.isOwn ?? (Boolean(userId) && userId === authUserId);

  return useQuery({
    queryKey: queryKeys.level.user(userId ?? ''),
    queryFn: (): Promise<UserLevelInfo> =>
      isOwn ? levelsApi.getMyLevel() : levelsApi.getUserLevel(userId!),
    enabled: (options?.enabled ?? true) && !!userId,
    staleTime: 30_000,
  });
}

export function useLevelTiersQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.level.tiers(),
    queryFn: () => levelsApi.getTiers(),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: options?.enabled ?? true,
  });
}

/** Refetch levels + public profile cards after XP-changing actions (gifts, etc.). */
export function invalidateUserLevels(...userIds: Array<string | null | undefined>): void {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  for (const id of unique) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.level.user(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.profile.public(id) });
  }
}

/** Merge fresh level numbers into the cached public profile snapshot. */
export function syncProfileLevelCache(
  userId: string,
  level: Pick<UserLevelInfo, 'richLevel' | 'charmLevel'>,
): void {
  queryClient.setQueryData<PublicUser>(queryKeys.profile.public(userId), (prev) =>
    prev
      ? { ...prev, richLevel: level.richLevel, charmLevel: level.charmLevel }
      : prev,
  );
}
