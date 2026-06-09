import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as walletService from './wallet.service';
import { assertDirectUserTopupEnabled } from '../payments/payments-config';
import { ok } from '../../utils/response';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const exchangeSchema = z.object({
  beans: z.coerce.number().int().min(2),
});

const topUpSchema = z.object({
  coins: z.number().int().min(1),
});

const withdrawalSchema = z.object({
  beans: z.coerce.number().int().min(1),
  notes: z.string().default(''),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  paymentMethodId: z.string().uuid(),
});

/** GET /wallet */
export async function getBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await walletService.getBalance(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /wallet/transactions */
export async function getTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await walletService.getTransactions(req.user!.id, page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /wallet/exchange */
export async function exchange(req: Request, res: Response, next: NextFunction) {
  try {
    const { beans } = exchangeSchema.parse(req.body);
    const data = await walletService.exchangeBeansToCoins(req.user!.id, beans);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /wallet/topup */
export async function topUp(req: Request, res: Response, next: NextFunction) {
  try {
    await assertDirectUserTopupEnabled();
    const { coins } = topUpSchema.parse(req.body);
    const data = await walletService.topUp(req.user!.id, coins);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /wallet/withdraw */
export async function withdraw(req: Request, res: Response, next: NextFunction) {
  try {
    const { beans, notes, countryCode, paymentMethodId } = withdrawalSchema.parse(req.body);
    const data = await walletService.requestWithdrawal(
      req.user!.id,
      beans,
      notes,
      countryCode,
      paymentMethodId,
      req.ip ?? '',
    );
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /wallet/withdrawals */
export async function getWithdrawals(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await walletService.getWithdrawals(req.user!.id, page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /wallet/withdrawals/:id */
export async function getWithdrawalDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await walletService.getWithdrawalDetail(req.user!.id, req.params.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /wallet/withdrawals/:id/confirm-receipt */
export async function confirmWithdrawalReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await walletService.confirmWithdrawalReceipt(req.user!.id, req.params.id);
    ok(res, data, 'Receipt confirmed');
  } catch (err) { next(err); }
}

/** GET /wallet/bean-records — gift received, exchange, withdrawal bean ledger */
export async function getBeanRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await walletService.getBeanRecords(req.user!.id, page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

const disputeBodySchema = z.object({
  reason: z.string().min(1).max(1000),
});

/** POST /wallet/withdrawals/:id/dispute */
export async function disputeWithdrawal(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = disputeBodySchema.parse(req.body);
    const data = await walletService.userDisputeWithdrawal(
      req.user!.id,
      req.params.id,
      reason,
    );
    ok(res, data, 'Dispute submitted');
  } catch (err) { next(err); }
}
