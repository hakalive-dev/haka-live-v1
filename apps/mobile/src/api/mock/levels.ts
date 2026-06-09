import type { UserLevelInfo } from '@/types';

export const mockLevels: { myLevel: UserLevelInfo } = {
  myLevel: {
    richLevel: 5,
    richXp: 12_500,
    richNextThreshold: 21_600,
    charmLevel: 5,
    charmXp: 12_500,
    charmNextThreshold: 21_600,
    updatedAt: new Date().toISOString(),
  },
};
