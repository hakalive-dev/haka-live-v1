import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ok } from '../../../utils/response';
import * as service from './seller-recharge-config.service';

const updateSchema = z.object({
  epay_email: z.string(),
  usdt_trc20_address: z.string(),
  usdt_bep20_address: z.string(),
  direct_user_topup_enabled: z.boolean(),
});

export async function getConfig(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await service.getSellerRechargeConfig());
  } catch (err) {
    next(err);
  }
}

export async function updateConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateSchema.parse(req.body);
    const data = await service.updateSellerRechargeConfig(
      req.admin!.id,
      body,
      req.ip,
    );
    ok(res, data, 'Payment settings saved');
  } catch (err) {
    next(err);
  }
}
