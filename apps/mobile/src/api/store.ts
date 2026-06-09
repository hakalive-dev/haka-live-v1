import { apiClient } from './client';
import type { StoreCategoryItem, StoreItem, UserStoreItem, StoreCategory } from '../types';

export const storeApi = {
  getCategories: async (): Promise<StoreCategoryItem[]> => {
    const res = await apiClient.get('/store/categories');
    return res.data;
  },

  getItems: async (category?: StoreCategory): Promise<StoreItem[]> => {
    const res = await apiClient.get('/store/items', { params: category ? { category } : {} });
    return res.data;
  },

  purchase: async (itemId: string): Promise<UserStoreItem> => {
    const res = await apiClient.post('/store/purchase', { itemId });
    return res.data;
  },

  sendItem: async (itemId: string, recipientHakaId: string) => {
    const res = await apiClient.post('/store/send', { itemId, recipientHakaId });
    return res.data;
  },

  getMyItems: async (category?: StoreCategory): Promise<UserStoreItem[]> => {
    const res = await apiClient.get('/store/mine', { params: category ? { category } : {} });
    return res.data;
  },

  equip: async (userStoreItemId: string): Promise<UserStoreItem> => {
    const res = await apiClient.post('/store/equip', { userStoreItemId });
    return res.data;
  },

  unequip: async (userStoreItemId: string): Promise<UserStoreItem> => {
    const res = await apiClient.post('/store/unequip', { userStoreItemId });
    return res.data;
  },

  // ── Special ID Store ──────────────────────────────────────────────────

  getSpecialIds: async (level?: string) => {
    const res = await apiClient.get('/store/special-ids', { params: level ? { level } : {} });
    return res.data as Array<{
      id: string;
      number: string;
      price: number;
      durationDays: number;
      level: string;
    }>;
  },

  purchaseSpecialId: async (specialIdId: string) => {
    const res = await apiClient.post('/store/special-ids/purchase', { specialIdId });
    return res.data;
  },

  getMySpecialIds: async () => {
    const res = await apiClient.get('/store/special-ids/mine');
    return res.data as Array<{
      id: string;
      specialId: { id: string; number: string; level: string; durationDays: number };
      pricePaid: number;
      status: string;
      activatedAt: string | null;
      expiresAt: string | null;
      purchasedAt: string;
    }>;
  },

  activateSpecialId: async (inventoryId: string) => {
    const res = await apiClient.post('/store/special-ids/activate', { inventoryId });
    return res.data;
  },

  deactivateSpecialId: async () => {
    const res = await apiClient.post('/store/special-ids/deactivate');
    return res.data;
  },

  sendSpecialId: async (specialIdId: string, recipientHakaId: string) => {
    const res = await apiClient.post('/store/special-ids/send', { specialIdId, recipientHakaId });
    return res.data;
  },
};
