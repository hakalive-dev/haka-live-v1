import { z } from 'zod';

const multiplierTierSchema = z.object({
  multiplier: z.number().min(0),
  rewardCoins: z.number().min(0),
  weight: z.number().min(0),
});

export const luckySettingUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    winProbability: z.number().min(0).max(1).optional(),
    winMultiplier: z.number().min(0).optional(),
    winMultiplierTiers: z.array(multiplierTierSchema).min(1).optional(),
    receiverBenefitPercent: z.number().min(0).max(1.5).optional(),
    dailyUserWinCapCoins: z.string().regex(/^\d+$/).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
  .refine(
    (v) =>
      v.winMultiplierTiers === undefined ||
      v.winMultiplierTiers.some(
        (tier) => tier.weight > 0 && tier.multiplier > 0 && tier.rewardCoins > 0,
      ),
    { message: 'At least one payout tier must have multiplier, rewardCoins, and weight > 0' },
  );

export type LuckySettingUpdateInput = z.infer<typeof luckySettingUpdateSchema>;

export const luckyDrawsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  userId: z.string().min(1).optional(),
  giftId: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
  isWin: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export type LuckyDrawsQuery = z.infer<typeof luckyDrawsQuerySchema>;
