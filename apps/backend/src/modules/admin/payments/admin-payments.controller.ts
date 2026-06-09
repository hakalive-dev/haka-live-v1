import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as paymentsService from './admin-payments.service';
import { ok } from '../../../utils/response';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const walletTxSchema = listSchema.extend({
  walletId: z.string().optional(),
  userId:   z.string().uuid().optional(),
  currency: z.string().optional(),
  transactionType: z.string().optional(),
});

const paymentTxListSchema = listSchema.extend({
  status: z.enum(['pending', 'succeeded', 'failed']).optional(),
  userId: z.string().uuid().optional(),
  method: z.string().optional(),
  packageId: z.string().uuid().optional(),
  from:   z.string().optional(),
  to:     z.string().optional(),
});

export async function listWallets(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await paymentsService.listWallets(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function listWalletTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const params = walletTxSchema.parse(req.query);
    const result = await paymentsService.listWalletTransactions(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function listPaymentTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const params = paymentTxListSchema.parse(req.query);
    const result = await paymentsService.listPaymentTransactions(params);
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

export async function purchasesSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const params = paymentTxListSchema.parse(req.query);
    ok(res, await paymentsService.paymentTransactionsSummary(params));
  } catch (err) {
    next(err);
  }
}

export async function purchasesExport(req: Request, res: Response, next: NextFunction) {
  try {
    const params = paymentTxListSchema.parse(req.query);
    const csv = await paymentsService.exportPaymentTransactionsCsv(params);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="coin-purchases-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

export async function getWalletByUserId(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = await paymentsService.getWalletByUserId(req.params.userId);
    ok(res, wallet);
  } catch (err) { next(err); }
}

// ── Withdrawals ───────────────────────────────────────────────────────────────

const withdrawalListSchema = listSchema.extend({
  status: z.enum([
    'pending',
    'pending_review',
    'assigned',
    'proof_submitted',
    'completed',
    'approved',
    'rejected',
    'disputed',
  ]).optional(),
  userId: z.string().uuid().optional(),
  countryCode: z.string().length(2).optional(),
});

export async function listWithdrawals(req: Request, res: Response, next: NextFunction) {
  try {
    const params = withdrawalListSchema.parse(req.query);
    const result = await paymentsService.listWithdrawals(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function listPayrollAgents(req: Request, res: Response, next: NextFunction) {
  try {
    const countryCode = typeof req.query.countryCode === 'string' ? req.query.countryCode : undefined;
    const result = await paymentsService.listPayrollAgentsForWithdrawals(countryCode);
    ok(res, result);
  } catch (err) { next(err); }
}

const assignSchema = z.object({
  agentUserId: z.string().uuid(),
});

export async function assignWithdrawal(req: Request, res: Response, next: NextFunction) {
  try {
    const { agentUserId } = assignSchema.parse(req.body);
    const result = await paymentsService.assignWithdrawal(
      req.params.id,
      agentUserId,
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, result, 'Withdrawal assigned to payroll agent');
  } catch (err) { next(err); }
}

export async function verifyWithdrawalProof(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.verifyWithdrawalProof(
      req.params.id,
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, result, 'Payment proof verified');
  } catch (err) { next(err); }
}

export async function freezeWithdrawal(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.freezeWithdrawal(
      req.params.id,
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, result, 'Withdrawal frozen');
  } catch (err) { next(err); }
}

export async function approveWithdrawal(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.approveWithdrawal(
      req.params.id,
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, result, 'Withdrawal force-completed');
  } catch (err) { next(err); }
}

// ── Manual Balance Adjustment ─────────────────────────────────────────────────

const adjustSchema = z.object({
  currency: z.enum(['coins', 'beans']),
  amount:   z.number().int().refine(v => v !== 0, { message: 'Amount cannot be zero' }),
  reason:   z.string().min(1),
});

export async function adjustBalance(req: Request, res: Response, next: NextFunction) {
  try {
    const body = adjustSchema.parse(req.body);
    const result = await paymentsService.adjustBalance(
      req.admin!.id,
      req.params.userId,
      body.currency,
      body.amount,
      body.reason,
      req.ip,
    );
    ok(res, result, 'Balance adjusted');
  } catch (err) { next(err); }
}

export async function rejectWithdrawal(req: Request, res: Response, next: NextFunction) {
  try {
    const { notes = '' } = req.body;
    const result = await paymentsService.rejectWithdrawal(
      req.params.id,
      notes,
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, result, 'Withdrawal rejected');
  } catch (err) { next(err); }
}

// ── Seller Recharge Requests ──────────────────────────────────────────────────

const sellerRechargeListSchema = listSchema.extend({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  userId: z.string().uuid().optional(),
});

export async function listSellerRecharges(req: Request, res: Response, next: NextFunction) {
  try {
    const params = sellerRechargeListSchema.parse(req.query);
    const result = await paymentsService.listSellerRecharges(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function approveSellerRecharge(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.approveSellerRecharge(req.params.id, req.admin!.id);
    ok(res, result, 'Recharge approved');
  } catch (err) { next(err); }
}

export async function rejectSellerRecharge(req: Request, res: Response, next: NextFunction) {
  try {
    const { notes = '' } = req.body;
    const result = await paymentsService.rejectSellerRecharge(req.params.id, req.admin!.id, notes);
    ok(res, result, 'Recharge rejected');
  } catch (err) { next(err); }
}

// ── Seller exchange requests ────────────────────────────────────────────────────

const sellerExchangeListSchema = sellerRechargeListSchema;

export async function listSellerExchangeRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const params = sellerExchangeListSchema.parse(req.query);
    const result = await paymentsService.listSellerExchangeRequests(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function approveSellerExchange(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.approveSellerExchange(
      req.params.id,
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, result, 'Exchange approved');
  } catch (err) { next(err); }
}

export async function rejectSellerExchange(req: Request, res: Response, next: NextFunction) {
  try {
    const { notes = '' } = req.body;
    const result = await paymentsService.rejectSellerExchange(
      req.params.id,
      req.admin!.id,
      notes,
      req.ip ?? '',
    );
    ok(res, result, 'Exchange rejected');
  } catch (err) { next(err); }
}

const disputeSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export async function disputeWithdrawal(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = disputeSchema.parse(req.body);
    const result = await paymentsService.disputeWithdrawal(
      req.params.id,
      reason,
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, result, 'Withdrawal marked as disputed');
  } catch (err) { next(err); }
}
