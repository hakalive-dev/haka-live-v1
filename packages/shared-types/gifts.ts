export const GIFT_CATEGORIES = {
  BASIC: 'basic',
  PREMIUM: 'premium',
  LUXURY: 'luxury',
  SPECIAL: 'special',
} as const;

export type GiftCategory = typeof GIFT_CATEGORIES[keyof typeof GIFT_CATEGORIES];
