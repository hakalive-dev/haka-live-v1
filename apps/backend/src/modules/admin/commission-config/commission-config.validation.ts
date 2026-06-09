import { z } from 'zod';

// BigInt serialized as string on the wire; parsed and range-checked here.
const BigIntNonNeg = z.string().regex(/^\d+$/, 'must be a non-negative integer string');

export const tierCreateSchema = z.object({
  name:            z.string().min(1).max(40),
  minHostIncome:   BigIntNonNeg,
  commissionRate:  z.number().min(0).max(1),
}).strict();

export const tierUpdateSchema = z.object({
  name:            z.string().min(1).max(40).optional(),
  minHostIncome:   BigIntNonNeg.optional(),
  commissionRate:  z.number().min(0).max(1).optional(),
}).strict();

export const bonusSettingUpdateSchema = z
  .object({
    bonusRate: z.number().min(0).max(1).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((data) => data.bonusRate !== undefined || data.enabled !== undefined, {
    message: 'At least one of bonusRate or enabled is required',
  });

export const giftBonusTierCreateSchema = z.object({
  name:             z.string().min(1).max(40),
  minRollingIncome: BigIntNonNeg,
  bonusRate:        z.number().min(0).max(1),
}).strict();

export const giftBonusTierUpdateSchema = z.object({
  name:             z.string().min(1).max(40).optional(),
  minRollingIncome: BigIntNonNeg.optional(),
  bonusRate:        z.number().min(0).max(1).optional(),
}).strict();

export const overrideSchema = z.object({
  rate: z.number().min(0).max(1).nullable(),
  /** ISO-8601 with offset; null = no end date (override applies until cleared). Omitted with non-null rate clears end date. */
  validUntil: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

export const ledgerQuerySchema = z.object({
  cursor: z.string().optional(),
  limit:  z.coerce.number().int().positive().max(200).optional(),
  from:   z.string().datetime({ offset: true }).optional(),
  to:     z.string().datetime({ offset: true }).optional(),
});
