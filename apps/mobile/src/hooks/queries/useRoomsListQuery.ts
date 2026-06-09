import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { roomsApi } from '@api/rooms';
import { queryKeys } from '@api/queryKeys';
import type { Room } from '@/types';

export type RoomsListParams = {
  category?: string;
  following?: boolean;
  nearby?: boolean;
  newest?: boolean;
  roomMode?: 'chat' | 'live';
};

export function useRoomsListQuery(
  params: RoomsListParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.rooms.list(params),
    queryFn: async () => {
      const data = await roomsApi.list(params);
      return data.items as Room[];
    },
    staleTime: 120_000,
    // Keep the current list on screen while a tab/filter switch loads, instead
    // of flashing an empty/loading state.
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}
