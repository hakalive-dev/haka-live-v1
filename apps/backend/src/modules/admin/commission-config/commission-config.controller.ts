import { Request, Response, NextFunction } from 'express';
import * as svc from './commission-config.service';
import { ok } from '../../../utils/response';
import {
  tierCreateSchema,
  tierUpdateSchema,
  bonusSettingUpdateSchema,
  giftBonusTierCreateSchema,
  giftBonusTierUpdateSchema,
  overrideSchema,
  ledgerQuerySchema,
} from './commission-config.validation';

export async function listTiers(_req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.listTiers()); } catch (err) { next(err); }
}

export async function createTier(req: Request, res: Response, next: NextFunction) {
  try {
    const body = tierCreateSchema.parse(req.body);
    ok(res, await svc.createTier(body));
  } catch (err) { next(err); }
}

export async function updateTier(req: Request, res: Response, next: NextFunction) {
  try {
    const body = tierUpdateSchema.parse(req.body);
    ok(res, await svc.updateTier(req.params.id, body));
  } catch (err) { next(err); }
}

export async function deleteTier(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deleteTier(req.params.id);
    ok(res, { deleted: true });
  } catch (err) { next(err); }
}

export async function getBonusSetting(_req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.getBonusSetting()); } catch (err) { next(err); }
}

export async function updateBonusSetting(req: Request, res: Response, next: NextFunction) {
  try {
    const body = bonusSettingUpdateSchema.parse(req.body);
    const adminUserId = req.admin?.id ?? '';
    ok(res, await svc.updateBonusSetting(adminUserId, body));
  } catch (err) { next(err); }
}

export async function listGiftBonusTiers(_req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.listGiftBonusTiers()); } catch (err) { next(err); }
}

export async function createGiftBonusTier(req: Request, res: Response, next: NextFunction) {
  try {
    const body = giftBonusTierCreateSchema.parse(req.body);
    ok(res, await svc.createGiftBonusTier(body));
  } catch (err) { next(err); }
}

export async function updateGiftBonusTier(req: Request, res: Response, next: NextFunction) {
  try {
    const body = giftBonusTierUpdateSchema.parse(req.body);
    ok(res, await svc.updateGiftBonusTier(req.params.id, body));
  } catch (err) { next(err); }
}

export async function deleteGiftBonusTier(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deleteGiftBonusTier(req.params.id);
    ok(res, { deleted: true });
  } catch (err) { next(err); }
}

export async function setCommissionOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const body = overrideSchema.parse(req.body);
    ok(res, await svc.setCommissionOverride(req.params.id, { rate: body.rate, validUntil: body.validUntil }));
  } catch (err) { next(err); }
}

export async function setGiftBonusOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const body = overrideSchema.parse(req.body);
    ok(res, await svc.setGiftBonusOverride(req.params.id, { rate: body.rate, validUntil: body.validUntil }));
  } catch (err) { next(err); }
}

export async function adminListLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const query = ledgerQuerySchema.parse(req.query);
    ok(res, await svc.adminListLedger(req.params.id, query));
  } catch (err) { next(err); }
}

export async function getPlatformRevenue(_req: Request, res: Response, next: NextFunction) {
  try { ok(res, await svc.getPlatformRevenue()); } catch (err) { next(err); }
}

export async function listPlatformRevenueLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const query = ledgerQuerySchema.parse(req.query);
    ok(res, await svc.listPlatformRevenueLedger(query));
  } catch (err) { next(err); }
}
