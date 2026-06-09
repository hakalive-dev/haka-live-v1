import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/** Refetch a TanStack Query when the screen gains focus, only if data is stale. */
export function useRefetchOnFocusIfStale(
  refetch: () => unknown,
  isStale: boolean,
  enabled = true,
) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !isStale) return;
      void refetch();
    }, [enabled, isStale, refetch]),
  );
}
