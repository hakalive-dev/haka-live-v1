import { apiClient } from './client';
import { useMock } from './config';
import { mockProfileByIdOrHaka, mockUsers } from './mock/users';
import type { PaginatedResult, PublicUser, SpecialAttentionEntry, VisitorEntry } from '../types';

export const usersApi = {
  /** GET /api/v1/users/:id — public profile (optional auth via query param viewerId) */
  profile: async (userId: string): Promise<PublicUser> => {
    if (useMock) {
      const u = mockProfileByIdOrHaka(userId);
      if (!u) throw new Error('User not found');
      return u;
    }
    const res = await apiClient.get(`/users/${userId}`);
    return res.data;
  },

  /** GET /api/v1/users/search?q=&page=&limit= */
  search: async (
    query: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<PublicUser>> => {
    if (useMock) return mockUsers.searchResults;
    const res = await apiClient.get('/users/search', { params: { q: query, page, limit } });
    return res.data;
  },

  /** GET /api/v1/users/:id/followers */
  followers: async (userId: string, page = 1): Promise<PaginatedResult<PublicUser>> => {
    if (useMock) return mockUsers.followers;
    const res = await apiClient.get(`/users/${userId}/followers`, { params: { page } });
    return res.data;
  },

  /** GET /api/v1/users/:id/friends */
  friends: async (userId: string, page = 1): Promise<PaginatedResult<PublicUser>> => {
    if (useMock) return mockUsers.friends ?? mockUsers.following;
    const res = await apiClient.get(`/users/${userId}/friends`, { params: { page } });
    return res.data;
  },

  /** GET /api/v1/users/:id/following */
  following: async (userId: string, page = 1): Promise<PaginatedResult<PublicUser>> => {
    if (useMock) return mockUsers.following;
    const res = await apiClient.get(`/users/${userId}/following`, { params: { page } });
    return res.data;
  },

  /** POST /api/v1/users/:id/follow */
  follow: async (userId: string): Promise<void> => {
    if (useMock) return;
    await apiClient.post(`/users/${userId}/follow`);
  },

  /** DELETE /api/v1/users/:id/follow */
  unfollow: async (userId: string): Promise<void> => {
    if (useMock) return;
    await apiClient.delete(`/users/${userId}/follow`);
  },

  /** POST /api/v1/users/:id/special-attention */
  addSpecialAttention: async (userId: string): Promise<void> => {
    if (useMock) return;
    await apiClient.post(`/users/${userId}/special-attention`);
  },

  /** DELETE /api/v1/users/:id/special-attention */
  removeSpecialAttention: async (userId: string): Promise<void> => {
    if (useMock) return;
    await apiClient.delete(`/users/${userId}/special-attention`);
  },

  /** GET /api/v1/users/me/special-attention */
  mySpecialAttention: async (page = 1): Promise<PaginatedResult<SpecialAttentionEntry>> => {
    if (useMock) return mockUsers.specialAttention;
    const res = await apiClient.get('/users/me/special-attention', { params: { page } });
    return res.data;
  },

  /** POST /api/v1/users/:id/visit */
  logVisit: async (userId: string): Promise<void> => {
    if (useMock) return;
    await apiClient.post(`/users/${userId}/visit`);
  },

  /** GET /api/v1/users/:id/presence */
  presence: async (
    userId: string,
  ): Promise<{
    isOnline: boolean;
    lastSeenAt: string | null;
    activeRoom: {
      id: string;
      roomMode: 'chat' | 'live';
      isLocked: boolean;
      hostId: string;
      title?: string;
    } | null;
  }> => {
    if (useMock) return { isOnline: true, lastSeenAt: null, activeRoom: null };
    const res = await apiClient.get(`/users/${userId}/presence`);
    return res.data;
  },

  /** GET /api/v1/users/me/visitors */
  myVisitors: async (page = 1): Promise<PaginatedResult<VisitorEntry>> => {
    if (useMock) return mockUsers.visitors;
    const res = await apiClient.get('/users/me/visitors', { params: { page } });
    return res.data;
  },
};
