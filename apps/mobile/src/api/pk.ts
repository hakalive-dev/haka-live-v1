import { apiClient } from './client';

export interface PkLiveRoom {
  id: string;
  title: string;
  viewerCount: number;
  host: { id: string; displayName: string; avatar: string | null };
}

export interface PkMatchStarted {
  matchId: string;
  hostAId: string;
  hostBId: string;
  roomAId: string;
  roomBId: string;
  scoreA: number;
  scoreB: number;
  durationSecs: number;
  endsAt: string;
}

export const pkApi = {
  joinQueue: (durationSecs: number) =>
    apiClient.post<{ queued: boolean; durationSecs: number }>('/pk/queue/join', { durationSecs }),

  leaveQueue: (durationSecs: number) =>
    apiClient.post<{ queued: boolean }>('/pk/queue/leave', { durationSecs }),

  getLiveRooms: (excludeRoomId?: string) =>
    apiClient.get<PkLiveRoom[]>('/pk/live-rooms', { params: { excludeRoomId } }),

  sendInvite: (toRoomId: string, toHostId: string, durationSecs: number) =>
    apiClient.post<{ inviteId: string }>('/pk/invite', { toRoomId, toHostId, durationSecs }),

  respondToInvite: (inviteId: string, accept: boolean) =>
    apiClient.post<{ accepted: boolean; matchId?: string; endsAt?: string }>(
      `/pk/invite/${inviteId}/respond`,
      { accept },
    ),
};
