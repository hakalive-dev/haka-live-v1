import { apiClient } from './client';
import { useMock } from './config';
import { mockChat } from './mock/chat';
import type {
  AgoraTokenResult,
  ChatMessage,
  DirectMessage,
  DMConversation,
  PaginatedResult,
  TeamAnnouncementPayload,
} from '../types';

export const chatApi = {
  getRoomMessages: async (roomId: string): Promise<ChatMessage[]> => {
    if (useMock) return mockChat.roomMessages;
    const res = await apiClient.get(`/chat/rooms/${roomId}/messages`);
    const items: ChatMessage[] = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
    return [...items].reverse();
  },

  sendRoomImage: async (
    roomId: string,
    args: { fileUri: string; mimeType: string; fileName: string; caption?: string },
  ): Promise<ChatMessage> => {
    const form = new FormData();
    form.append('file', {
      uri: args.fileUri,
      name: args.fileName,
      type: args.mimeType,
    } as unknown as Blob);
    if (args.caption && args.caption.length > 0) {
      form.append('caption', args.caption);
    }

    const res = await apiClient.post(`/chat/rooms/${roomId}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  getTeamAnnouncement: async (): Promise<{
    announcement: TeamAnnouncementPayload | null;
  }> => {
    if (useMock) return { announcement: null };
    const res = await apiClient.get('/chat/team-announcement');
    return res.data;
  },

  markTeamAnnouncementRead: async (announcementId: string): Promise<{ ok: boolean }> => {
    if (useMock) return { ok: true };
    const res = await apiClient.post('/chat/team-announcement/read', { announcementId });
    return res.data;
  },

  getMessagesBadgeCount: async (): Promise<{ count: number }> => {
    if (useMock) {
      const dmUnread = mockChat.conversations.reduce((n, c) => n + c.unreadCount, 0);
      return { count: dmUnread };
    }
    const res = await apiClient.get('/chat/messages-badge');
    return res.data;
  },

  getConversations: async (): Promise<DMConversation[]> => {
    if (useMock) return mockChat.conversations;
    const res = await apiClient.get('/chat/conversations');
    return res.data;
  },

  getFriendConversations: async (): Promise<DMConversation[]> => {
    if (useMock) return mockChat.conversations.filter((c) => c.isFriend === true);
    const res = await apiClient.get('/chat/conversations/friends');
    return res.data;
  },

  getOnlineFriends: async (): Promise<Array<{ id: string; displayName: string; avatar: string | null; isOnline: boolean }>> => {
    if (useMock) return mockChat.onlineFriends;
    const res = await apiClient.get('/chat/friends/online');
    return res.data;
  },

  getDMMessages: async (
    userId: string,
    page = 1,
  ): Promise<PaginatedResult<DirectMessage>> => {
    if (useMock) {
      return { items: mockChat.dmMessages, total: mockChat.dmMessages.length, page: 1, limit: 50, hasMore: false };
    }
    const res = await apiClient.get(`/chat/conversations/${userId}/messages?page=${page}`);
    return res.data;
  },

  sendDM: async (userId: string, content: string): Promise<DirectMessage> => {
    if (useMock) {
      const currentUser = {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        username: 'amara_live',
        displayName: 'Amara Okafor',
        avatar: 'https://i.pravatar.cc/150?u=amara_live',
        hakaId: 'HK294817',
      };
      const otherUser = mockChat.conversations.find(c => c.otherUser.id === userId)?.otherUser ?? currentUser;
      return {
        id: `dm-${Date.now()}`,
        sender: currentUser,
        recipient: otherUser,
        content,
        isRead: false,
        createdAt: new Date().toISOString(),
      };
    }
    const res = await apiClient.post(`/chat/conversations/${userId}/messages`, { content });
    return res.data;
  },

  sendDMImage: async (
    userId: string,
    args: { fileUri: string; mimeType: string; fileName: string; caption?: string },
  ): Promise<DirectMessage> => {
    const form = new FormData();
    form.append('file', {
      uri: args.fileUri,
      name: args.fileName,
      type: args.mimeType,
    } as unknown as Blob);
    if (args.caption && args.caption.length > 0) {
      form.append('caption', args.caption);
    }
    const res = await apiClient.post(`/chat/conversations/${userId}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  sendGiftDM: async (userId: string, giftId: string, qty: number): Promise<DirectMessage> => {
    const res = await apiClient.post(`/chat/conversations/${userId}/gift`, { giftId, qty });
    return res.data;
  },

  markAsRead: async (userId: string): Promise<{ markedRead: number }> => {
    if (useMock) return { markedRead: 0 };
    const res = await apiClient.post(`/chat/conversations/${userId}/read`);
    return res.data;
  },

  /** GET /chat/conversations/:userId/call-token — Agora token for 1:1 video call */
  getCallToken: async (userId: string): Promise<AgoraTokenResult> => {
    if (useMock) {
      return {
        token:     'mock-call-token',
        channel:   `call_mock_${userId}`,
        uid:       Math.floor(Math.random() * 100000),
        appId:     'mock-app-id',
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
      };
    }
    const res = await apiClient.get(`/chat/conversations/${userId}/call-token`);
    return res.data;
  },

  /** POST — notify callee (socket + push) for 1:1 voice/video call */
  postCallInvite: async (
    userId: string,
    callType: 'voice' | 'video' = 'video',
  ): Promise<{ signaled: boolean }> => {
    if (useMock) return { signaled: true };
    const res = await apiClient.post(`/chat/conversations/${userId}/call-invite`, { callType });
    return res.data;
  },

  postCallDecline: async (userId: string): Promise<{ declined: boolean }> => {
    if (useMock) return { declined: true };
    const res = await apiClient.post(`/chat/conversations/${userId}/call-decline`);
    return res.data;
  },

  postCallEnd: async (userId: string): Promise<{ ended: boolean }> => {
    if (useMock) return { ended: true };
    const res = await apiClient.post(`/chat/conversations/${userId}/call-end`);
    return res.data;
  },

  postCallCancel: async (userId: string): Promise<{ cancelled: boolean }> => {
    if (useMock) return { cancelled: true };
    const res = await apiClient.post(`/chat/conversations/${userId}/call-cancel`);
    return res.data;
  },

  deleteDMMessage: async (
    messageId: string,
    mode: 'for_me' | 'for_everyone',
  ): Promise<{ messageId: string; hidden: true } | DirectMessage> => {
    if (useMock) {
      if (mode === 'for_everyone') {
        const existing = mockChat.dmMessages.find((m) => m.id === messageId);
        if (existing) {
          return { ...existing, content: '', isDeleted: true };
        }
      }
      return { messageId, hidden: true };
    }
    const res = await apiClient.delete(`/chat/conversations/messages/${messageId}`, { mode });
    return res.data as { messageId: string; hidden: true } | DirectMessage;
  },

  forwardDMMessage: async (messageId: string, recipientId: string): Promise<DirectMessage> => {
    if (useMock) {
      const source = mockChat.dmMessages.find((m) => m.id === messageId);
      const recipient =
        mockChat.conversations.find((c) => c.otherUser.id === recipientId)?.otherUser ??
        mockChat.conversations[0]?.otherUser;
      if (!source || !recipient) {
        throw new Error('Message not found');
      }
      return {
        ...source,
        id: `dm-fwd-${Date.now()}`,
        recipient,
        isRead: false,
        createdAt: new Date().toISOString(),
      };
    }
    const res = await apiClient.post(`/chat/conversations/messages/${messageId}/forward`, { recipientId });
    return res.data as DirectMessage;
  },
};
