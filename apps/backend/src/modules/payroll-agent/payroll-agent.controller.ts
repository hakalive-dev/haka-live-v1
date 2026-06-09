import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/error.middleware';
import { ok } from '../../utils/response';
import { storageFilename } from '../../utils/upload';
import { uploadToStorage } from '../../utils/storage';
import * as service from './payroll-agent.service';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['assigned', 'proof_submitted', 'success', 'failed']).optional(),
});

const proofBodySchema = z.object({
  notes: z.string().max(2000).optional().default(''),
  transactionId: z.string().max(200).optional().default(''),
});

const patchMeSchema = z.object({
  acceptingOrders: z.boolean().optional(),
});

const summaryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function requestBaseUrl(req: Request): string {
  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return host ? `${proto}://${host}` : '';
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.getAgentMe(req.user!.id);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function patchMe(req: Request, res: Response, next: NextFunction) {
  try {
    const body = patchMeSchema.parse(req.body);
    const result = await service.patchAgentMe(req.user!.id, body);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const q = summaryQuerySchema.parse(req.query);
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const result = await service.getSummary(req.user!.id, from, to);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function listMyWithdrawals(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status } = paginationSchema.parse(req.query);
    const result = await service.listAssignedWithdrawals(
      req.user!.id,
      page,
      limit,
      status,
    );
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getWithdrawal(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.getWithdrawalDetail(req.user!.id, req.params.id);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function submitProof(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file?.buffer) {
      throw new AppError('Payment proof file is required', 400);
    }
    const { notes, transactionId } = proofBodySchema.parse(req.body);
    const filename = `withdrawal-proofs/${storageFilename(file.originalname)}`;
    const proofUrl = await uploadToStorage(
      file.buffer,
      filename,
      file.mimetype,
      undefined,
      requestBaseUrl(req),
    );
    const result = await service.submitWithdrawalProof(
      req.user!.id,
      req.params.id,
      proofUrl,
      notes,
      transactionId,
      file.buffer,
    );
    ok(res, result, 'Payment proof submitted');
  } catch (err) { next(err); }
}

export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.acceptWithdrawal(req.user!.id, req.params.id);
    ok(res, result, 'Withdrawal accepted');
  } catch (err) { next(err); }
}

export async function decline(req: Request, res: Response, next: NextFunction) {
  try {
    await service.declineWithdrawal(req.user!.id, req.params.id);
    ok(res, null, 'Withdrawal declined and returned to queue');
  } catch (err) { next(err); }
}
