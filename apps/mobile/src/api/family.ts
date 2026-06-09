import { apiClient } from './client';
import { useMock } from './config';
import type { Family, FamilyDetail, FamilyMember, PaginatedResult } from '../types';

const mockFamilies: Family[] = [
  {
    id: 'fam-001',
    name: 'Purple Wolves',
    owner: { id: 'user-uuid-001', username: 'test_host', displayName: 'Test Host', avatar: '' },
    tier: 'gold',
    badge: '🐺',
    announcement: 'Welcome to Purple Wolves!',
    weeklyBeans: 50000,
    totalBeans: 250000,
    createdAt: new Date().toISOString(),
    _count: { members: 12 },
  },
];

export const familyApi = {
  list: async (page = 1, search?: string): Promise<PaginatedResult<Family>> => {
    if (useMock) {
      return { items: mockFamilies, total: 1, page: 1, limit: 20, hasMore: false };
    }
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    const res = await apiClient.get(`/family?${params.toString()}`);
    return res.data;
  },

  get: async (familyId: string): Promise<FamilyDetail> => {
    if (useMock) return { ...mockFamilies[0], id: familyId, members: [] };
    const res = await apiClient.get(`/family/${familyId}`);
    return res.data;
  },

  getMyFamily: async (): Promise<FamilyDetail | null> => {
    if (useMock) return { ...mockFamilies[0], members: [] };
    try {
      const res = await apiClient.get('/family/me');
      return res.data;
    } catch {
      return null;
    }
  },

  create: async (data: { name: string; announcement?: string }): Promise<Family> => {
    if (useMock) return { ...mockFamilies[0], ...data, id: `fam-${Date.now()}` };
    const res = await apiClient.post('/family', data);
    return res.data;
  },

  update: async (data: { name?: string; announcement?: string; badge?: string }): Promise<Family> => {
    if (useMock) return { ...mockFamilies[0], ...data };
    const res = await apiClient.patch('/family', data);
    return res.data;
  },

  join: async (familyId: string): Promise<FamilyMember> => {
    if (useMock) {
      return {
        id: `mem-${Date.now()}`,
        user: { id: 'user-uuid-001', username: 'test_user', displayName: 'Test User', avatar: '', role: 'normal_user' },
        role: 'member',
        joinedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
    }
    const res = await apiClient.post(`/family/${familyId}/join`);
    return res.data;
  },

  leave: async (): Promise<void> => {
    if (useMock) return;
    await apiClient.post('/family/leave');
  },

  disband: async (): Promise<void> => {
    if (useMock) return;
    await apiClient.delete('/family');
  },

  promoteMember: async (userId: string): Promise<FamilyMember> => {
    if (useMock) {
      return {
        id: `mem-${Date.now()}`,
        user: { id: userId, username: null, displayName: 'User', avatar: '', role: 'normal_user' },
        role: 'admin',
        joinedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
    }
    const res = await apiClient.post('/family/members/promote', { userId });
    return res.data;
  },

  kickMember: async (userId: string): Promise<void> => {
    if (useMock) return;
    await apiClient.post('/family/members/kick', { userId });
  },
};
