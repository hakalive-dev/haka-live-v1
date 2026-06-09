import { normalizeCatalogueGifts } from '@components/gifts/GiftEffectOverlay';

import { apiClient } from './client';
import { useMock } from './config';
import { mockGifts } from './mock/gifts';
import type { Gift, GiftTransaction, SendGiftPayload } from '../types';

export const giftsApi = {
  catalogue: async (): Promise<Gift[]> => {
    if (useMock) return normalizeCatalogueGifts(mockGifts.catalogue);
    const res = await apiClient.get('/gifts');
    return normalizeCatalogueGifts(res.data);
  },

  send: async (payload: SendGiftPayload): Promise<GiftTransaction> => {
    if (useMock) {
      const gift = mockGifts.catalogue.find((g) => g.id === payload.giftId) ?? mockGifts.catalogue[0];
      const qty = payload.qty ?? 1;
      const recipientId = payload.recipientId ?? `agency:${payload.recipientAgencyId ?? 'unknown'}`;
      return {
        id: `tx-${Date.now()}`,
        gift,
        sender: { id: 'user-uuid-001', username: 'test_user', displayName: 'Test User', avatar: '' },
        recipient: { id: recipientId, username: 'recipient', displayName: 'Recipient', avatar: '' },
        roomId: payload.roomId ?? null,
        coinCost: gift.coinCost * qty,
        beanValue: gift.beanValue * qty,
        qty,
        createdAt: new Date().toISOString(),
      };
    }
    const res = await apiClient.post('/gifts/send', payload, { timeout: 30_000 });
    return res.data;
  },

  received: async (
    userId: string,
    limit = 16,
  ): Promise<{ id: string; name: string; icon: string; image: string | null; qty: number; receivedAt: string }[]> => {
    const res = await apiClient.get(`/gifts/received/${userId}`, { params: { limit } });
    return res.data;
  },
};
