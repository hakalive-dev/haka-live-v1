import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export type StaleFocusReloadOptions = {
  /** Skip refetch when data is newer than this (ms). Default 60_000. */
  staleMs?: number;
  /** When false, never auto-reload on focus. Default true. */
  enabled?: boolean;
  /** Called when focus reload is skipped due to stale data (e.g. setLoading(false)). */
  onStaleSkip?: () => void;
  /** Called before a network reload starts (e.g. setLoading(true)). */
  onReloadStart?: () => void;
};

/**
 * Refetch on screen focus, but skip when data was loaded recently (stale-while-revalidate).
 * Call `markLoaded()` after a successful fetch so stale skips apply on the next focus.
 */
export function useStaleFocusReload(
  reload: (force?: boolean) => void | Promise<void>,
  options?: StaleFocusReloadOptions,
) {
  const staleMs = options?.staleMs ?? 60_000;
  const enabled = options?.enabled ?? true;
  const onStaleSkip = options?.onStaleSkip;
  const onReloadStart = options?.onReloadStart;

  const lastLoadedAt = useRef(0);
  const hasDataRef = useRef(false);

  const guardedReload = useCallback(
    async (force = false) => {
      if (!enabled) return;
      if (
        !force &&
        hasDataRef.current &&
        Date.now() - lastLoadedAt.current < staleMs
      ) {
        onStaleSkip?.();
        return;
      }
      onReloadStart?.();
      lastLoadedAt.current = Date.now();
      await reload(force);
    },
    [reload, enabled, staleMs, onStaleSkip, onReloadStart],
  );

  useFocusEffect(
    useCallback(() => {
      void guardedReload(false);
    }, [guardedReload]),
  );

  const markLoaded = useCallback(() => {
    hasDataRef.current = true;
  }, []);

  const invalidate = useCallback(() => {
    hasDataRef.current = false;
    lastLoadedAt.current = 0;
  }, []);

  return { reload: guardedReload, markLoaded, invalidate, hasDataRef };
}
