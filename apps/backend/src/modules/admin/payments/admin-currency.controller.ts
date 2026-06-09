import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from '../../payments/currency.service';
import { ok, created } from '../../../utils/response';

const upsertSchema = z.object({
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Country code must be 2 letters (ISO 3166)'),
  countryName: z.string().trim().min(1).max(64),
  currency:    z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency must be 3 letters (ISO 4217)'),
  symbol:      z.string().trim().min(1).max(8),
  usdRate:     z.coerce.number().positive(),
  isActive:    z.boolean().optional(),
  minWithdrawalBeans: z.coerce.number().int().min(1).optional(),
  displayOrder: z.coerce.number().int().optional(),
});

const bulkActivateSchema = z.object({
  countryCodes: z.array(z.string().trim().toUpperCase()).min(1),
  isActive: z.boolean(),
});

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    await service.ensureSeeded();
    const rows = await service.listAll();
    ok(res, rows);
  } catch (err) { next(err); }
}

export async function upsert(req: Request, res: Response, next: NextFunction) {
  try {
    const input = upsertSchema.parse(req.body);
    const row = await service.upsertRate(input);
    created(res, row);
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteRate(req.params.countryCode.toUpperCase());
    ok(res, null, 'Deleted');
  } catch (err) { next(err); }
}

export async function sync(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.syncFromPublicApi();
    ok(res, result, 'FX rates synced');
  } catch (err) { next(err); }
}

export async function importAll(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.bulkImportFromPublicApi();
    ok(res, result, 'Currencies imported from FX API');
  } catch (err) { next(err); }
}

export async function bulkActivate(req: Request, res: Response, next: NextFunction) {
  try {
    const { countryCodes, isActive } = bulkActivateSchema.parse(req.body);
    const result = await service.bulkActivate(countryCodes, isActive);
    ok(res, result, isActive ? 'Markets activated' : 'Markets deactivated');
  } catch (err) { next(err); }
}
