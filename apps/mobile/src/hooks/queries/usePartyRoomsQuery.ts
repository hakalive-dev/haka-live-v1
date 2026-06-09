import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { roomsApi } from '@api/rooms';
import { queryKeys } from '@api/queryKeys';
import type { Room } from '@/types';

export type PartyRoomsData = {
  rooms: Room[];
  myRoom: Room | null;
};

export function usePartyRoomsQuery(following: boolean) {
  return useQuery({
    queryKey: queryKeys.rooms.party(following),
    queryFn: async (): Promise<PartyRoomsData> => {
      const [data, myRoomInfo] = await Promise.all([
        roomsApi.list(following ? { following: true } : undefined),
        roomsApi.getMyActiveRoom().catch(() => null),
      ]);

      if (myRoomInfo) {
        const found = data.items.find((r) => r.id === myRoomInfo.id);
        if (found) {
          return {
            myRoom: found,
            rooms: data.items.filter((r) => r.id !== myRoomInfo.id),
          };
        }
        try {
          const full = await roomsApi.detail(myRoomInfo.id);
          return { myRoom: full, rooms: data.items };
        } catch {
          return { myRoom: null, rooms: data.items };
        }
      }
      return { myRoom: null, rooms: data.items };
    },
    staleTime: 60_000,
    // Keep the current rooms visible while switching For You / Following.
    placeholderData: keepPreviousData,
  });
}
