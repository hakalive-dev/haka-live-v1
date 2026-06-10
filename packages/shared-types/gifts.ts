export const GIFT_CATEGORIES = {
  BAG: 'bag',
  HOT: 'hot',
  LUCKY: 'lucky',
  EVENT: 'event',
  SVIP: 'svip',
  CUSTOMIZED: 'customized',
} as const;

export type GiftCategory = (typeof GIFT_CATEGORIES)[keyof typeof GIFT_CATEGORIES];

export const GIFT_CATEGORY_VALUES = Object.values(GIFT_CATEGORIES);

export const GIFT_CATEGORY_LABELS: Record<GiftCategory, string> = {
  bag: 'Bag',
  hot: 'Hot',
  lucky: 'Lucky',
  event: 'Event',
  svip: 'SVIP',
  customized: 'Customized',
};

const LEGACY_GIFT_CATEGORY_MAP: Record<string, GiftCategory> = {
  basic: 'bag',
  premium: 'hot',
  special: 'lucky',
  luxury: 'hot',
};

export function parseGiftCategory(value: string | undefined | null): GiftCategory | undefined {
  const key = (value ?? '').toLowerCase().trim();
  if (!key) return undefined;
  if ((GIFT_CATEGORY_VALUES as readonly string[]).includes(key)) {
    return key as GiftCategory;
  }
  return LEGACY_GIFT_CATEGORY_MAP[key];
}

export function normalizeGiftCategory(
  value: string | undefined | null,
  fallback: GiftCategory = GIFT_CATEGORIES.BAG,
): GiftCategory {
  return parseGiftCategory(value) ?? fallback;
}

/** Bag-tier gifts: light toast/fly animation only (no full-screen effect unless SVGA). */
export function isBagGiftCategory(category: string | undefined | null): boolean {
  const c = (category ?? '').toLowerCase();
  return c === 'bag' || c === 'basic';
}

/** Lucky-tier gifts (high-end catalogue). */
export function isLuckyGiftCategory(category: string | undefined | null): boolean {
  const c = (category ?? '').toLowerCase();
  return c === 'lucky' || c === 'special';
}
