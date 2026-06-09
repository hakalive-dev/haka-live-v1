import { apiClient } from './client';
import type { PaginatedResult, PublicUser, Room } from '../types';

export interface SearchResults {
  users: PublicUser[];
  rooms: Room[];
}

export const searchApi = {
  /** Global search — returns users + rooms */
  globalSearch: async (query: string, type: 'all' | 'users' | 'rooms' = 'all'): Promise<SearchResults> => {
    const res = await apiClient.get('/search', { params: { q: query, type } });
    return res.data;
  },

  /** Search users only */
  searchUsers: async (query: string): Promise<PublicUser[]> => {
    const res = await apiClient.get('/users/search', { params: { q: query } });
    const data = res.data as PublicUser[] | PaginatedResult<PublicUser>;
    return Array.isArray(data) ? data : data.items;
  },

  /** Search rooms by title */
  searchRooms: async (query: string): Promise<Room[]> => {
    const res = await apiClient.get('/rooms', { params: { q: query } });
    return res.data;
  },
};
