import { Request, Response, NextFunction } from 'express';
import { ok } from '../../utils/response';
import * as service from './account-deletion.service';

/**
 * GET /api/v1/auth/me/deletion-eligibility
 * Pre-check so clients can show blocking reasons BEFORE the destructive flow.
 */
export async function getDeletionEligibility(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eligibility = await service.checkDeletionEligibility(req.user!.id);
    ok(res, { ...eligibility, supportEmail: service.DELETION_SUPPORT_EMAIL });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/auth/me
 * Self-service account deletion (anonymize-in-place). Bearer token is the
 * authorization — sessions are OTP-derived, so no extra OTP round-trip.
 * 409 with blocking reasons when the account has open obligations.
 */
export async function deleteMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.selfDeleteAccount(req.user!.id, req.ip);
    ok(res, result, 'Account deleted successfully');
  } catch (err) {
    next(err);
  }
}
