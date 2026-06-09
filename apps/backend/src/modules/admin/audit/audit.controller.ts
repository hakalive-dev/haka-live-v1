import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as auditService from './audit.service';
import { ok } from '../../../utils/response';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  adminId: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export async function listAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await auditService.listAuditLogs(params);
    ok(res, result);
  } catch (err) { next(err); }
}
