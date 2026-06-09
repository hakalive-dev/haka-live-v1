import { useQuery } from '@tanstack/react-query';

import { chatApi } from '@api/chat';
import { queryKeys } from '@api/queryKeys';
import type { DMConversation, RoomUser, TeamAnnouncementPayload } from '@/types';
import { HAKA_TEAM_USER_ID } from '@/constants/haka-team';

function ensureHakaTeamInInbox(convos: DMConversation[]): DMConversation[] {
  const has = convos.some((c) => c.otherUser?.id === HAKA_TEAM_USER_ID);
  if (has) return convos;
  const otherUser: RoomUser = {
    id: HAKA_TEAM_USER_ID,
    username: null,
    displayName: 'Haka Team',
    avatar: '',
    hakaId: null,
    profileHidden: true,
  };
  const row: DMConversation = {
    otherUser,
    lastMessage: null,
    unreadCount: 0,
    isFollowing: false,
    isFamiliar: false,
  };
  return [row, ...convos];
}

export type ChatInboxData = {
  conversations: DMConversation[];
  friendConversations: DMConversation[];
  onlineFriends: Awaited<ReturnType<typeof chatApi.getOnlineFriends>>;
  teamAnnouncement: TeamAnnouncementPayload | null;
};

export function useChatInboxQuery() {
  return useQuery({
    queryKey: queryKeys.chat.inbox(),
    queryFn: async (): Promise<ChatInboxData> => {
      const [convosRes, friendConvosRes, friendsRes, annRes] =
        await Promise.allSettled([
          chatApi.getConversations(),
          chatApi.getFriendConversations(),
          chatApi.getOnlineFriends(),
          chatApi.getTeamAnnouncement(),
        ]);

      if (convosRes.status !== 'fulfilled') throw convosRes.reason;

      return {
        conversations: ensureHakaTeamInInbox(convosRes.value),
        friendConversations:
          friendConvosRes.status === 'fulfilled' ? friendConvosRes.value : [],
        onlineFriends:
          friendsRes.status === 'fulfilled' ? friendsRes.value : [],
        teamAnnouncement:
          annRes.status === 'fulfilled' ? annRes.value.announcement : null,
      };
    },
    staleTime: 120_000,
  });
}
