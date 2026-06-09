import { apiClient } from './client';

export interface StartBattleInput {
  participantAId: string;
  participantBId: string;
  mode: 'coins' | 'votes';
  durationSecs: number;
}

export interface NormalBattle {
  id: string;
  roomId: string;
  hostId: string;
  participantAId: string;
  participantBId: string;
  mode: 'coins' | 'votes';
  status: string;
  scoreA: number;
  scoreB: number;
  durationSecs: number;
  startedAt: string;
}

export const battleApi = {
  start: (roomId: string, input: StartBattleInput) =>
    apiClient.post<NormalBattle>(`/rooms/${roomId}/battle`, input),

  cancel: (roomId: string) =>
    apiClient.post<void>(`/rooms/${roomId}/battle/cancel`),
};
