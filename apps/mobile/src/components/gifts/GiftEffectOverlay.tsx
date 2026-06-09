import React from 'react';

import { SpecialGiftEffect } from '@screens/room/SpecialGiftEffect';
import { SVGAGiftEffect } from '@screens/room/SVGAGiftEffect';
import type { Gift } from '@/types';

export type GiftSpecialEffect = {
  id: string;
  animationType: string;
  giftIcon: string;
  giftImage: string | null;
  svgaAsset: string | null;
  senderName: string;
  giftName: string;
  qty: number;
  coinCost: number;
};

export type GiftPanelTabKey = 'bag' | 'hot' | 'lucky' | 'event' | 'svip' | 'customized';

const LEGACY_TAB_CATEGORY: Record<'bag' | 'hot' | 'lucky', 'basic' | 'premium' | 'special'> = {
  bag: 'basic',
  hot: 'premium',
  lucky: 'special',
};

/** Coerce API / DM fields that may arrive as strings. */
export function normalizeGiftCoinCost(
  value: { coinCost?: unknown; coin_cost?: unknown } | unknown,
): number {
  if (value != null && typeof value === 'object') {
    const raw =
      'coinCost' in value
        ? (value as { coinCost?: unknown }).coinCost
        : 'coin_cost' in value
          ? (value as { coin_cost?: unknown }).coin_cost
          : undefined;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Catalogue grid: cheapest gifts first (stable within equal price). */
export function sortGiftsByCoinAsc<T extends { coinCost?: unknown; coin_cost?: unknown }>(
  gifts: T[],
): T[] {
  return [...gifts].sort(
    (a, b) => normalizeGiftCoinCost(a) - normalizeGiftCoinCost(b),
  );
}

export function normalizeCatalogueGifts(gifts: Gift[]): Gift[] {
  return sortGiftsByCoinAsc(
    gifts.map((g) => ({ ...g, coinCost: normalizeGiftCoinCost(g) })),
  );
}

/** Gifts shown per panel tab — includes event / svip / customized category values from the API. */
export function getGiftsForTab(catalogue: Gift[], tab: GiftPanelTabKey): Gift[] {
  const legacy = LEGACY_TAB_CATEGORY[tab as keyof typeof LEGACY_TAB_CATEGORY];
  const list = legacy
    ? catalogue.filter((g) => (g.category ?? '').toLowerCase() === legacy)
    : catalogue.filter((g) => (g.category ?? '').toLowerCase() === tab);
  return sortGiftsByCoinAsc(list);
}

/** Play cheaper gift effects before more expensive ones; keep the active effect at the front. */
export function sortGiftEffectsByCoinAsc(
  effects: GiftSpecialEffect[],
): GiftSpecialEffect[] {
  return [...effects].sort((a, b) => a.coinCost - b.coinCost);
}

export function mergeGiftEffectQueueSorted(
  current: GiftSpecialEffect[],
  incoming: GiftSpecialEffect[],
): GiftSpecialEffect[] {
  if (incoming.length === 0) return current;
  if (current.length === 0) return sortGiftEffectsByCoinAsc(incoming);
  const [playing, ...waiting] = current;
  return [playing, ...sortGiftEffectsByCoinAsc([...waiting, ...incoming])];
}

export type DmGiftPopItem = {
  id: string;
  giftIcon: string;
  giftImage: string | null;
  coinCost: number;
};

export function sortDmGiftPopByCoinAsc(items: DmGiftPopItem[]): DmGiftPopItem[] {
  return [...items].sort((a, b) => a.coinCost - b.coinCost);
}

export function mergeDmGiftPopQueueSorted(
  current: DmGiftPopItem[],
  incoming: DmGiftPopItem[],
): DmGiftPopItem[] {
  if (incoming.length === 0) return current;
  if (current.length === 0) return sortDmGiftPopByCoinAsc(incoming);
  const [playing, ...waiting] = current;
  return [playing, ...sortDmGiftPopByCoinAsc([...waiting, ...incoming])];
}

interface Props {
  effect: GiftSpecialEffect | null;
  onComplete: () => void;
}

export function GiftEffectOverlay({ effect, onComplete }: Props) {
  if (!effect) return null;

  if (effect.svgaAsset) {
    return (
      <SVGAGiftEffect
        key={effect.id}
        visible
        svgaAsset={effect.svgaAsset}
        giftImage={effect.giftImage}
        giftIcon={effect.giftIcon}
        senderName={effect.senderName}
        giftName={effect.giftName}
        qty={effect.qty}
        onComplete={onComplete}
      />
    );
  }

  return (
    <SpecialGiftEffect
      key={effect.id}
      visible
      animationType={effect.animationType}
      giftIcon={effect.giftIcon}
      giftImage={effect.giftImage}
      senderName={effect.senderName}
      giftName={effect.giftName}
      qty={effect.qty}
      onComplete={onComplete}
    />
  );
}
