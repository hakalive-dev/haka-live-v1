import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { apiClient } from './client';
import { useMock } from './config';
import { mockRooms } from './mock/rooms';
import { TokenStorage } from '../storage';
import type {
  AgoraTokenResult,
  CreateRoomData,
  MusicQueue,
  PaginatedResult,
  Room,
  RoomMusicTrack,
  Seat,
  ThemePayload,
} from '../types';
import type { EquippedCosmetic } from '../types';

export interface RoomAdmin {
  id: string;
  user: {
    id: string;
    username: string | null;
    displayName: string;
    avatar: string | null;
    hakaId: string;
    equippedFrame?: import('../types').EquippedCosmetic | null;
    activeSpecialId?: string | null;
  };
}

export interface RoomStats {
  date: string;
  liveDurationMins: number;
  liveRoomMyselfCoins: number;
  pkTimes: number;
  micDurationMins: number;
  chatRoomGiftCoins: number;
  chatRoomMyselfMessages: number;
}

export interface CalcScoreEntry {
  userId: string;
  seatPosition: number;
  points: number;
  user: { displayName: string; avatar: string | null };
}

export interface CalcContributorEntry {
  senderId: string;
  points: number;
  user: { displayName: string; avatar: string | null; hakaId: string | null };
}

export interface CalcRecipientContributorsResult {
  totalReceiving: number;
  recipient: { id: string; displayName: string; avatar: string | null; hakaId: string | null } | null;
  contributors: CalcContributorEntry[];
}

export interface MemberEntry {
  id: string;
  displayName: string;
  avatar: string | null;
  hakaId: string | null;
  equippedFrame?: EquippedCosmetic | null;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
  joinedAt: string;
}

export interface RoomMembersPage {
  members: MemberEntry[];
  total: number;
  page: number;
  limit: number;
}

export const roomsApi = {
  /** GET /api/v1/rooms?page=&limit=&category=&following=&nearby=&newest=&roomMode= */
  list: async (params?: {
    page?: number;
    limit?: number;
    category?: string;
    following?: boolean;
    nearby?: boolean;
    newest?: boolean;
    roomMode?: 'chat' | 'live';
  }): Promise<PaginatedResult<Room>> => {
    if (useMock) return mockRooms.list;
    const res = await apiClient.get('/rooms', { params, timeout: 20_000 });
    return res.data;
  },

  /** GET /api/v1/rooms/:id */
  detail: async (roomId: string): Promise<Room> => {
    if (useMock) return mockRooms.detail;
    const res = await apiClient.get(`/rooms/${roomId}`, { timeout: 30_000 });
    return res.data;
  },

  /** POST /api/v1/rooms */
  create: async (data: CreateRoomData): Promise<Room> => {
    if (useMock) return mockRooms.detail;
    const res = await apiClient.post('/rooms', data);
    return res.data;
  },

  /** PATCH /api/v1/rooms/:id */
  update: async (
    roomId: string,
    data: Partial<Pick<Room,
      'title' | 'description' | 'coverImage' | 'category' | 'type' |
      'micConfig' | 'applyForMic' | 'gameType' | 'fanBadge' | 'roomMode'
    >> & { password?: string | null },
  ): Promise<Room> => {
    if (useMock) return mockRooms.detail;
    const res = await apiClient.patch(`/rooms/${roomId}`, data);
    return res.data;
  },

  /** PATCH /api/v1/rooms/:id/chat-lock */
  toggleChatLock: async (roomId: string, locked: boolean): Promise<{ chatLocked: boolean }> => {
    if (useMock) return { chatLocked: locked };
    const res = await apiClient.patch(`/rooms/${roomId}/chat-lock`, { locked });
    return res.data;
  },

  /** POST /api/v1/rooms/:id/clear-chat */
  clearChat: async (roomId: string): Promise<void> => {
    if (useMock) return;
    await apiClient.post(`/rooms/${roomId}/clear-chat`);
  },

  /** PATCH /api/v1/rooms/:id/theme */
  applyTheme: async (roomId: string, themeId: string): Promise<{ theme: ThemePayload }> => {
    if (useMock) return { theme: { id: 'mock-theme', name: 'Mock Theme', gradientFrom: '#1E1A3C', gradientTo: '#2A2550', backgroundImageUrl: null, svgaUrl: null, accentColor: '#7c3aed', chatBubbleColor: '#2A2550' } };
    const res = await apiClient.patch(`/rooms/${roomId}/theme`, { themeId });
    return res.data;
  },

  /** DELETE /api/v1/rooms/:id/theme */
  resetTheme: async (roomId: string): Promise<void> => {
    if (useMock) return;
    await apiClient.delete(`/rooms/${roomId}/theme`);
  },

  /** PATCH /api/v1/rooms/:id/public-msg */
  togglePublicMsg: async (roomId: string): Promise<{ publicMsgEnabled: boolean }> => {
    const res = await apiClient.patch(`/rooms/${roomId}/public-msg`);
    return res.data;
  },

  /** GET /api/v1/rooms/:id/music/queue — host/admin only */
  getMusicQueue: async (roomId: string): Promise<MusicQueue> => {
    const res = await apiClient.get(`/rooms/${roomId}/music/queue`);
    return res.data;
  },

  /** POST /api/v1/rooms/:id/music/queue — multipart upload */
  addMusicTrack: async (
    roomId: string,
    fileUri: string,
    mimeType: string,
    filename: string,
  ): Promise<{ track: RoomMusicTrack; queue: MusicQueue }> => {
    const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010/api/v1');
    const token = await TokenStorage.getAccess();
    const result = await uploadAsync(
      `${baseUrl}/rooms/${roomId}/music/queue`,
      fileUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType,
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'ngrok-skip-browser-warning': 'true',
        },
        parameters: { filename },
      },
    );
    const body = JSON.parse(result.body);
    if (body.success === false) throw new Error(body.message ?? 'Upload failed');
    return body.data ?? body;
  },

  /** POST /api/v1/rooms/:id/music/queue/from-library */
  addMusicFromLibrary: async (
    roomId: string,
    libraryTrackId: string,
    options?: { playNow?: boolean },
  ): Promise<{ track: RoomMusicTrack & { index: number; total: number }; queue: MusicQueue }> => {
    const res = await apiClient.post(`/rooms/${roomId}/music/queue/from-library`, {
      libraryTrackId,
      playNow: options?.playNow === true,
    });
    return res.data;
  },

  /** DELETE /api/v1/rooms/:id/music/queue/:trackId */
  removeMusicTrack: async (roomId: string, trackId: string): Promise<{ queue: MusicQueue }> => {
    const res = await apiClient.delete(`/rooms/${roomId}/music/queue/${trackId}`);
    return res.data;
  },

  /** PATCH /api/v1/rooms/:id/music/queue/reorder */
  reorderMusicQueue: async (
    roomId: string,
    positions: Array<{ id: string; position: number }>,
  ): Promise<{ tracks: RoomMusicTrack[] }> => {
    const res = await apiClient.patch(`/rooms/${roomId}/music/queue/reorder`, { positions });
    return res.data;
  },

  /** POST /api/v1/rooms/:id/music/skip */
  skipMusicTrack: async (
    roomId: string,
    direction: 'next' | 'prev',
  ): Promise<{ track: (RoomMusicTrack & { index: number; total: number }) | null }> => {
    const res = await apiClient.post(`/rooms/${roomId}/music/skip`, { direction });
    return res.data;
  },

  /** PATCH /api/v1/rooms/:id/music/loop */
  setMusicLoop: async (roomId: string, loop: boolean): Promise<{ loop: boolean }> => {
    const res = await apiClient.patch(`/rooms/${roomId}/music/loop`, { loop });
    return res.data;
  },

  /** DELETE /api/v1/rooms/:id/music — clear entire queue */
  clearMusic: async (roomId: string): Promise<void> => {
    await apiClient.delete(`/rooms/${roomId}/music`);
  },

  /** PATCH /api/v1/rooms/:id/hd-mic */
  toggleHdMic: async (roomId: string): Promise<{ hdMicEnabled: boolean }> => {
    const res = await apiClient.patch(`/rooms/${roomId}/hd-mic`);
    return res.data;
  },

  /** GET /api/v1/themes/available */
  getAvailableThemes: async (): Promise<ThemePayload[]> => {
    if (useMock) return [];
    const res = await apiClient.get('/themes/available');
    return res.data;
  },

  /** POST /api/v1/rooms/:id/cover — multipart/form-data with 'file' */
  uploadCover: async (roomId: string, fileUri: string, mimeType: string, filename: string): Promise<{ coverImage: string; room: Room }> => {
    const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010/api/v1');
    const token = await TokenStorage.getAccess();
    const result = await uploadAsync(
      `${baseUrl}/rooms/${roomId}/cover`,
      fileUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType,
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'ngrok-skip-browser-warning': 'true',
        },
        parameters: { filename },
      },
    );
    const body = JSON.parse(result.body);
    if (body.success === false) throw new Error(body.message ?? 'Upload failed');
    return body.data ?? body;
  },

  /** @deprecated Use addMusicTrack — legacy path still supported by backend */
  uploadMusic: async (roomId: string, fileUri: string, mimeType: string, filename: string): Promise<{ bgMusicUrl: string }> => {
    const { track } = await roomsApi.addMusicTrack(roomId, fileUri, mimeType, filename);
    return { bgMusicUrl: track.url };
  },

  /** GET /api/v1/rooms/:id/admins */
  listAdmins: async (roomId: string): Promise<RoomAdmin[]> => {
    if (useMock) return [];
    const res = await apiClient.get(`/rooms/${roomId}/admins`);
    return res.data;
  },

  /** GET /api/v1/rooms/:id/stats?date=YYYY-MM-DD */
  getStats: async (roomId: string, date: string): Promise<RoomStats> => {
    if (useMock) {
      return {
        date, liveDurationMins: 0, liveRoomMyselfCoins: 0, pkTimes: 0,
        micDurationMins: 0, chatRoomGiftCoins: 0, chatRoomMyselfMessages: 0,
      };
    }
    const res = await apiClient.get(`/rooms/${roomId}/stats`, { params: { date } });
    return res.data;
  },

  /** POST /api/v1/rooms/:id/admins */
  addAdmin: async (roomId: string, userId: string) => {
    const res = await apiClient.post(`/rooms/${roomId}/admins`, { userId });
    return res.data;
  },

  /** DELETE /api/v1/rooms/:id/admins/:userId */
  removeAdmin: async (roomId: string, userId: string) => {
    const res = await apiClient.delete(`/rooms/${roomId}/admins/${userId}`);
    return res.data;
  },

  /** POST /api/v1/rooms/:id/start */
  start: async (roomId: string): Promise<Room> => {
    if (useMock) return { ...mockRooms.detail, status: 'live' };
    const res = await apiClient.post(`/rooms/${roomId}/start`);
    return res.data;
  },

  /** POST /api/v1/rooms/:id/end */
  end: async (roomId: string): Promise<Room> => {
    if (useMock) return { ...mockRooms.detail, status: 'ended' };
    const res = await apiClient.post(`/rooms/${roomId}/end`);
    return res.data;
  },

  /** GET /api/v1/rooms/mine — returns user's active room or null */
  getMyActiveRoom: async (): Promise<{ id: string; title: string; status: string; roomCode: string | null } | null> => {
    if (useMock) return null;
    const res = await apiClient.get('/rooms/mine');
    return res.data;
  },

  /** GET /api/v1/rooms/:id/seat-applicants — host or room admin; Redis queue for apply-for-mic */
  listSeatApplicants: async (roomId: string): Promise<unknown[]> => {
    if (useMock) return [];
    const res = await apiClient.get(`/rooms/${roomId}/seat-applicants`);
    const list = (res.data as { applicants?: unknown })?.applicants;
    return Array.isArray(list) ? list : [];
  },

  /** GET /api/v1/rooms/:id/seats */
  getSeats: async (roomId: string): Promise<Seat[]> => {
    if (useMock) return mockRooms.detail.seats ?? [];
    const res = await apiClient.get(`/rooms/${roomId}/seats`);
    return res.data;
  },

  /** POST /api/v1/rooms/:id/seats/:pos/take */
  takeSeat: async (roomId: string, position: number): Promise<Seat> => {
    if (useMock) return mockRooms.detail.seats![position - 1];
    const res = await apiClient.post(`/rooms/${roomId}/seats/${position}/take`);
    return res.data;
  },

  /** POST /api/v1/rooms/:id/seats/:pos/leave */
  leaveSeat: async (roomId: string, position: number): Promise<Seat> => {
    if (useMock) return mockRooms.detail.seats![position - 1];
    const res = await apiClient.post(`/rooms/${roomId}/seats/${position}/leave`);
    return res.data;
  },

  /** POST /api/v1/rooms/:id/seats/:pos/lock  body: { lock: boolean } */
  lockSeat: async (roomId: string, position: number, lock: boolean): Promise<Seat> => {
    if (useMock) return mockRooms.detail.seats![position - 1];
    const res = await apiClient.post(`/rooms/${roomId}/seats/${position}/lock`, { lock });
    return res.data;
  },

  /** POST /api/v1/rooms/:id/seats/:pos/kick */
  kickFromSeat: async (roomId: string, position: number): Promise<Seat> => {
    if (useMock) return mockRooms.detail.seats![position - 1];
    const res = await apiClient.post(`/rooms/${roomId}/seats/${position}/kick`);
    return res.data;
  },

  /** POST /api/v1/rooms/:id/kick body: { userId, reason? } */
  kickUserFromRoom: async (
    roomId: string,
    userId: string,
    reason?: string,
  ): Promise<{ kickedUserId: string; cooldownMinutes: number }> => {
    if (useMock) return { kickedUserId: userId, cooldownMinutes: 120 };
    const res = await apiClient.post(`/rooms/${roomId}/kick`, { userId, reason });
    return res.data;
  },

  /** POST /api/v1/rooms/:id/seats/invite  body: { userId, position? } */
  inviteToSeat: async (
    roomId: string,
    userId: string,
    position?: number,
  ): Promise<{ roomId: string; position: number }> => {
    if (useMock) return { roomId, position: position ?? 2 };
    const res = await apiClient.post(`/rooms/${roomId}/seats/invite`, { userId, position });
    return res.data;
  },

  /** GET /api/v1/rooms/:id/viewers — users currently connected via socket */
  getViewers: async (roomId: string): Promise<import('../types').RoomUser[]> => {
    if (useMock) return [];
    const res = await apiClient.get(`/rooms/${roomId}/viewers`);
    return (res.data as { viewers: import('../types').RoomUser[] }).viewers;
  },

  /** POST /api/v1/rooms/:id/members — permanent join */
  joinRoom: async (roomId: string): Promise<void> => {
    if (useMock) return;
    await apiClient.post(`/rooms/${roomId}/members`);
  },

  /** DELETE /api/v1/rooms/:id/members — permanent unjoin */
  unjoinRoom: async (roomId: string): Promise<void> => {
    if (useMock) return;
    await apiClient.delete(`/rooms/${roomId}/members`);
  },

  /** GET /api/v1/rooms/:id/members — list permanent members */
  listMembers: async (
    roomId: string,
    page = 1,
    limit = 50,
  ): Promise<MemberEntry[]> => {
    if (useMock) return [];
    const res = await apiClient.get<RoomMembersPage | MemberEntry[]>(
      `/rooms/${roomId}/members`,
      { params: { page, limit } },
    );
    const data = res.data;
    return Array.isArray(data) ? data : (data?.members ?? []);
  },

  /** GET /api/v1/rooms/:id/members/me — membership + room admin flag */
  isMember: async (
    roomId: string,
  ): Promise<{ isMember: boolean; isRoomAdmin: boolean }> => {
    if (useMock) return { isMember: false, isRoomAdmin: false };
    const res = await apiClient.get(`/rooms/${roomId}/members/me`);
    return res.data;
  },

  /** GET /api/v1/rooms/:id/contributions?period=all|daily|weekly|monthly */
  getContributions: async (
    roomId: string,
    period: 'all' | 'daily' | 'weekly' | 'monthly' = 'all',
  ): Promise<{ rank: number; score: number; user: { id: string; username: string | null; displayName: string; avatar: string | null; hakaId?: string | null; equippedFrame?: import('@/types').EquippedCosmetic | null; activeSpecialId?: string | null; richLevel?: number; charmLevel?: number } }[]> => {
    if (useMock) return [];
    const res = await apiClient.get(`/rooms/${roomId}/contributions`, { params: { period } });
    return res.data;
  },

  /** GET /api/v1/rooms/:id/token?role=publisher|subscriber */
  getToken: async (
    roomId: string,
    role: 'publisher' | 'subscriber' = 'publisher',
  ): Promise<AgoraTokenResult> => {
    if (useMock) {
      return {
        token: 'mock-agora-token',
        channel: roomId,
        uid: 12345,
        appId: 'mock-app-id',
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
      };
    }
    const res = await apiClient.get(`/rooms/${roomId}/token`, { params: { role }, timeout: 20_000 });
    return res.data;
  },

  startCalculator: async (
    roomId: string,
    durationSeconds: number | null,
  ): Promise<{ id: string; status: string; durationSeconds: number | null; endsAt: string | null; startedAt: string }> => {
    if (useMock) {
      return { id: 'mock-calc-1', status: 'active', durationSeconds, endsAt: null, startedAt: new Date().toISOString() };
    }
    const res = await apiClient.post(`/rooms/${roomId}/calculator/start`, { durationSeconds });
    return res.data;
  },

  endCalculator: async (
    roomId: string,
  ): Promise<{ session: { id: string; status: string }; scores: CalcScoreEntry[] }> => {
    if (useMock) return { session: { id: 'mock-calc-1', status: 'ended' }, scores: [] };
    const res = await apiClient.post(`/rooms/${roomId}/calculator/end`);
    return res.data;
  },

  getCalculator: async (
    roomId: string,
  ): Promise<{ session: { id: string; durationSeconds: number | null; endsAt: string | null; startedAt: string } | null; scores: CalcScoreEntry[] }> => {
    if (useMock) return { session: null, scores: [] };
    const res = await apiClient.get(`/rooms/${roomId}/calculator`);
    return res.data;
  },

  /** GET /api/v1/rooms/:id/calculator/contributors — gifters ranked by total points in active session */
  getCalculatorContributors: async (roomId: string): Promise<CalcContributorEntry[]> => {
    if (useMock) return [];
    const res = await apiClient.get(`/rooms/${roomId}/calculator/contributors`);
    return res.data;
  },

  /** GET /api/v1/rooms/:id/calculator/recipients/:userId/contributors */
  getCalculatorRecipientContributors: async (
    roomId: string,
    userId: string,
  ): Promise<CalcRecipientContributorsResult> => {
    if (useMock) {
      return { totalReceiving: 0, recipient: null, contributors: [] };
    }
    const res = await apiClient.get(
      `/rooms/${roomId}/calculator/recipients/${userId}/contributors`,
    );
    return res.data;
  },
};
