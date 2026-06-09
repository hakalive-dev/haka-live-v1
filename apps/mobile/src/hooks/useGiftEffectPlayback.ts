import { useCallback, useState } from 'react';

import {
  mergeGiftEffectQueueSorted,
  normalizeGiftCoinCost,
  type GiftSpecialEffect,
} from '@components/gifts/GiftEffectOverlay';
import type { Gift } from '@/types';

export type { GiftSpecialEffect };

function buildGiftEffectEntries(
  gift: Pick<
    Gift,
    'animationType' | 'icon' | 'image' | 'svgaAsset' | 'name' | 'category'
  > & { coinCost?: unknown },
  qty: number,
  senderName: string,
): GiftSpecialEffect[] {
  const playCount = Math.max(1, Math.min(50, Math.floor(qty)));
  const baseId = Date.now();
  const coinCost = normalizeGiftCoinCost(gift);
  return Array.from({ length: playCount }, (_, i) => ({
    id: `${baseId}-${i}-${Math.random().toString(36).slice(2, 9)}`,
    animationType: gift.animationType || 'scale',
    giftIcon: gift.icon,
    giftImage: gift.image ?? null,
    svgaAsset: gift.svgaAsset ?? null,
    senderName,
    giftName: gift.name,
    qty: 1,
    coinCost,
  }));
}

export function useGiftEffectPlayback() {
  const [specialEffectQueue, setSpecialEffectQueue] = useState<GiftSpecialEffect[]>([]);
  const specialEffect = specialEffectQueue[0] ?? null;

  const advanceGiftEffectQueue = useCallback(() => {
    setSpecialEffectQueue((prev) => (prev.length > 0 ? prev.slice(1) : prev));
  }, []);

  const enqueueGiftEffects = useCallback((entries: GiftSpecialEffect[]) => {
    if (entries.length === 0) return;
    setSpecialEffectQueue((prev) => mergeGiftEffectQueueSorted(prev, entries));
  }, []);

  const playGiftEffect = useCallback(
    (gift: Gift, qty: number, senderName: string) => {
      const hasSvga =
        typeof gift.svgaAsset === 'string' && gift.svgaAsset.trim().length > 0;
      const isBasic = (gift.category ?? '').toLowerCase() === 'basic';
      if (isBasic && !hasSvga) return;

      enqueueGiftEffects(buildGiftEffectEntries(gift, qty, senderName));
    },
    [enqueueGiftEffects],
  );

  return {
    specialEffect,
    advanceGiftEffectQueue,
    playGiftEffect,
    enqueueGiftEffects,
    buildGiftEffectEntries,
  };
}
