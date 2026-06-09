import { Request, Response, NextFunction } from 'express';
import { fail } from '../../utils/response';
import { assertActivePayrollAgent } from './payroll-agent-profile.service';

/** Requires authenticated user with an active PayrollAgentProfile (role may stay `agent`). */
export async function requirePayrollAgent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user?.id) {
    fail(res, 'Forbidden', 403);
    return;
  }
  try {
    await assertActivePayrollAgent(req.user.id);
    next();
  } catch {
    fail(res, 'Forbidden', 403);
  }
}
