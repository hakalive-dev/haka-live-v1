import { Request, Response, NextFunction } from 'express';
import { ok, created } from '../../../utils/response';
import { assertDirectUserTopupEnabled } from '../payments-config';
import * as razorpayService from './razorpay.service';

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    await assertDirectUserTopupEnabled();
    const { packageId } = req.body as { packageId: string };
    if (!packageId) {
      res.status(400).json({ success: false, data: null, message: 'packageId is required' });
      return;
    }
    const order = await razorpayService.createOrder(req.user!.id, packageId);
    created(res, order);
  } catch (err) {
    next(err);
  }
}

export async function webhook(req: Request, res: Response, next: NextFunction) {
  try {
    const rawBody: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));
    const signature = (req.headers['x-razorpay-signature'] as string) ?? '';
    await razorpayService.handleWebhook(rawBody, signature);
    ok(res, null, 'ok');
  } catch (err) {
    next(err);
  }
}
