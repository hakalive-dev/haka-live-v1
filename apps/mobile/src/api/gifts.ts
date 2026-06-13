import {
  isLuckyGiftCategory,
  normalizeCatalogueGifts,
} from '@components/gifts/GiftEffectOverlay';

import { apiClient } from './client';
import { useMock } from './config';
import { mockGifts } from './mock/gifts';
import type { Gift, GiftTransaction, LeaderboardUserEntry, SendGiftPayload } from '../types';

export interface RoomLuckyHistoryItem {
  id: string;
  rewardCoins: number;
  coinCost: number;
  receiverBeans: number;
  qty: number;
  createdAt: string;
  gift: { id: string; name: string; icon: string; image: string | null };
  user: {
    id: string;
    displayName: string;
    avatar: string;
    richLevel: number;
    charmLevel: number;
    equippedFrame?: import('../types').EquippedCosmetic | null;
  };
}

interface BackendLeaderboardItem {
  rank: number;
  score: number;
  user: {
    id: string;
    username: string | null;
    displayName: string;
    avatar: string | null;
    hakaId?: string | null;
    equippedFrame?: import('../types').EquippedCosmetic | null;
    activeSpecialId?: string | null;
    richLevel?: number | null;
    charmLevel?: number | null;
  };
}

function flattenLuckyRankItem(item: BackendLeaderboardItem): LeaderboardUserEntry {
  return {
    rank: item.rank,
    score: item.score,
    id: item.user.id,
    username: item.user.username,
    displayName: item.user.displayName,
    avatar: item.user.avatar,
    hakaId: item.user.hakaId ?? null,
    equippedFrame: item.user.equippedFrame ?? null,
    activeSpecialId: item.user.activeSpecialId ?? null,
    richLevel: item.user.richLevel ?? null,
    charmLevel: item.user.charmLevel ?? null,
  };
}

const MOCK_LUCKY_RANKINGS: LeaderboardUserEntry[] = [
  {
    rank: 1,
    score: 10_000_000,
    id: 'mock-lucky-1',
    username: 'samir',
    displayName: 'Samir',
    avatar: 'https://i.pravatar.cc/150?u=samir_lucky',
    richLevel: 30,
    charmLevel: 12,
  },
  {
    rank: 2,
    score: 5_200_000,
    id: 'mock-lucky-2',
    username: 'luna',
    displayName: 'Luna',
    avatar: 'https://i.pravatar.cc/150?u=luna_lucky',
    richLevel: 24,
    charmLevel: 18,
  },
  {
    rank: 3,
    score: 1_800_000,
    id: 'mock-lucky-3',
    username: 'kai',
    displayName: 'Kai',
    avatar: 'https://i.pravatar.cc/150?u=kai_lucky',
    richLevel: 19,
    charmLevel: 9,
  },
];

const MOCK_LUCKY_HISTORY: RoomLuckyHistoryItem[] = [
  {
    id: 'mock-hist-1',
    rewardCoins: 300_000,
    coinCost: 100_000,
    receiverBeans: 0,
    qty: 1,
    createdAt: new Date().toISOString(),
    gift: { id: 'g1', name: 'Magic Lamp', icon: '🧞', image: 'gifts/121.png' },
    user: {
      id: 'mock-lucky-1',
      displayName: 'Samir',
      avatar: 'https://i.pravatar.cc/150?u=samir_lucky',
      richLevel: 30,
      charmLevel: 12,
    },
  },
  {
    id: 'mock-hist-2',
    rewardCoins: 150_000,
    coinCost: 50_000,
    receiverBeans: 12,
    qty: 1,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    gift: { id: 'g2', name: 'Moonlight', icon: '🌙', image: 'gifts/116.png' },
    user: {
      id: 'mock-lucky-2',
      displayName: 'Luna',
      avatar: 'https://i.pravatar.cc/150?u=luna_lucky',
      richLevel: 24,
      charmLevel: 18,
    },
  },
];

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
      const coinCost = gift.coinCost * qty;
      const recipientId = payload.recipientId ?? `agency:${payload.recipientAgencyId ?? 'unknown'}`;
      const luckyDraw = isLuckyGiftCategory(gift.category)
        ? (() => {
            const isWin = Math.random() < 0.98;
            const mockTiers = [
              { payoutPercent: 40, weight: 30 },
              { payoutPercent: 88, weight: 25 },
              { payoutPercent: 95, weight: 20 },
              { payoutPercent: 105, weight: 12 },
              { payoutPercent: 220, weight: 6 },
              { payoutPercent: 350, weight: 3 },
              { payoutPercent: 520, weight: 1 },
            ];
            const totalWeight = mockTiers.reduce((sum, tier) => sum + tier.weight, 0);
            let roll = Math.random() * totalWeight;
            let picked = mockTiers[0]!;
            for (const tier of mockTiers) {
              roll -= tier.weight;
              if (roll < 0) {
                picked = tier;
                break;
              }
            }
            const rewardCoins = isWin ? Math.round((coinCost * picked.payoutPercent) / 100) : 0;
            return {
              drawId: `mock-draw-${Date.now()}`,
              isWin,
              winMultiplier: isWin ? picked.payoutPercent : 0,
              rewardCoins,
              coinCost,
              senderCoinBalance: 50_000 - coinCost + rewardCoins,
            };
          })()
        : null;
      return {
        id: `tx-${Date.now()}`,
        gift,
        sender: { id: 'user-uuid-001', username: 'test_user', displayName: 'Test User', avatar: '' },
        recipient: { id: recipientId, username: 'recipient', displayName: 'Recipient', avatar: '' },
        roomId: payload.roomId ?? null,
        coinCost,
        beanValue: gift.beanValue * qty,
        qty,
        createdAt: new Date().toISOString(),
        luckyDraw,
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

  getRoomLuckyRankings: async (
    roomId: string,
    limit = 50,
  ): Promise<{ items: LeaderboardUserEntry[] }> => {
    if (useMock) return { items: MOCK_LUCKY_RANKINGS };
    const res = await apiClient.get(`/gifts/lucky/room/${roomId}/rankings`, { params: { limit } });
    const items = (res.data.items as BackendLeaderboardItem[]).map(flattenLuckyRankItem);
    return { items };
  },

  getRoomLuckyHistory: async (
    roomId: string,
    page = 1,
    limit = 30,
  ): Promise<{ items: RoomLuckyHistoryItem[]; total: number; page: number; limit: number }> => {
    if (useMock) {
      return { items: MOCK_LUCKY_HISTORY, total: MOCK_LUCKY_HISTORY.length, page, limit };
    }
    const res = await apiClient.get(`/gifts/lucky/room/${roomId}/history`, { params: { page, limit } });
    return res.data;
  },
};
