export const MIC_CONFIGS = {
  FIVE: 5,
  TEN: 10,
  FIFTEEN: 15,
  TWENTY: 20,
} as const;

export const ROOM_TYPES = {
  VOICE: 'voice',
  VIDEO: 'video',
  PARTY: 'party',
} as const;

export type MicConfig = typeof MIC_CONFIGS[keyof typeof MIC_CONFIGS];
export type RoomType = typeof ROOM_TYPES[keyof typeof ROOM_TYPES];
