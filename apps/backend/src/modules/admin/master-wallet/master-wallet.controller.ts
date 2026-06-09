import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './master-wallet.service';

const requestMintSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().min(3),
});

const rejectMintSchema = z.object({
  rejectReason: z.string().min(3),
});

const transferSchema = z.object({
  fromType: z.enum(['MASTER', 'RECOVERY', 'BONUS', 'REVENUE']),
  toType:   z.enum(['MASTER', 'RECOVERY', 'BONUS', 'REVENUE']),
  amount:   z.number().int().positive(),
  reason:   z.string().min(3),
});

const creditUserSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().positive(),
  reason: z.string().min(3),
});

const deductUserSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().positive(),
  reason: z.string().min(3),
});

const reverseSchema = z.object({
  reason: z.string().min(3),
});

function adminId(req: Request) { return (req as any).admin.id as string; }

export async function getOverview(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await svc.getOverview() });
  } catch (e) { next(e); }
}

// ── Mint ──────────────────────────────────────────────────────────────────────

export async function requestMint(req: Request, res: Response, next: NextFunction) {
  try {
    const { amount, reason } = requestMintSchema.parse(req.body);
    const data = await svc.requestMint(adminId(req), amount, reason, req.ip);
    res.json({ success: true, data, message: `Mint request for ${amount.toLocaleString()} coins submitted — awaiting second super_admin approval` });
  } catch (e) { next(e); }
}

export async function listMintRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const status = req.query.status as string | undefined;
    res.json({ success: true, data: await svc.listMintRequests(status) });
  } catch (e) { next(e); }
}

export async function approveMint(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.approveMint(req.params.id, adminId(req), req.ip);
    res.json({ success: true, data, message: 'Mint approved — coins added to Master Wallet' });
  } catch (e) { next(e); }
}

export async function rejectMint(req: Request, res: Response, next: NextFunction) {
  try {
    const { rejectReason } = rejectMintSchema.parse(req.body);
    const data = await svc.rejectMint(req.params.id, adminId(req), rejectReason, req.ip);
    res.json({ success: true, data, message: 'Mint request rejected' });
  } catch (e) { next(e); }
}

// ── Transfer ──────────────────────────────────────────────────────────────────

export async function transfer(req: Request, res: Response, next: NextFunction) {
  try {
    const { fromType, toType, amount, reason } = transferSchema.parse(req.body);
    const data = await svc.transferBetweenWallets(adminId(req), fromType, toType, amount, reason, req.ip);
    res.json({ success: true, data, message: `Transferred ${amount} from ${fromType} to ${toType}` });
  } catch (e) { next(e); }
}

// ── Credit / Deduct user ──────────────────────────────────────────────────────

export async function creditUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, amount, reason } = creditUserSchema.parse(req.body);
    const data = await svc.creditUser(adminId(req), userId, amount, reason, req.ip);
    res.json({ success: true, data, message: `Credited ${amount} coins to user (from Master Wallet)` });
  } catch (e) { next(e); }
}

export async function deductUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, amount, reason } = deductUserSchema.parse(req.body);
    const data = await svc.deductUser(adminId(req), userId, amount, reason, req.ip);
    res.json({ success: true, data, message: `Deducted ${amount} coins → Recovery Wallet` });
  } catch (e) { next(e); }
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function listTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page  || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));
    const txType       = req.query.txType       as string | undefined;
    const targetUserId = req.query.targetUserId as string | undefined;
    const status       = req.query.status       as string | undefined;
    res.json({ success: true, data: await svc.listTransactions({ page, limit, txType, targetUserId, status }) });
  } catch (e) { next(e); }
}

// ── Reversal ──────────────────────────────────────────────────────────────────

export async function reverseTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = reverseSchema.parse(req.body);
    const data = await svc.reverseTransaction(req.params.id, adminId(req), reason, req.ip);
    res.json({ success: true, data, message: 'Transaction reversed — counter-entry recorded' });
  } catch (e) { next(e); }
}
