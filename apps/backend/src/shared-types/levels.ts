export const LEVEL_TYPES = {
  RICH: 'rich',
  CHARM: 'charm',
} as const;

export const MAX_LEVEL = 100;

export type LevelType = typeof LEVEL_TYPES[keyof typeof LEVEL_TYPES];
