import { z } from 'zod';

export const createInvitationSchema = z.object({
  toAgencyId: z.string().uuid(),
  note:       z.string().max(500).optional(),
}).strict();

export const adminListQuerySchema = z.object({
  status:       z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  fromAgencyId: z.string().uuid().optional(),
  toAgencyId:   z.string().uuid().optional(),
  cursor:       z.string().optional(),
  limit:        z.coerce.number().int().positive().max(200).optional(),
  from:         z.string().datetime({ offset: true }).optional(),
  to:           z.string().datetime({ offset: true }).optional(),
});

export const adminRejectSchema = z.object({
  note: z.string().max(500).optional(),
}).strict();
