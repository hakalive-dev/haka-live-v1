import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as paymentsService from './payments.service';
import * as currencyService from './currency.service';
import * as withdrawalPayoutService from './withdrawal-payout.service';
import {
  assertDirectUserTopupEnabled,
  getPaymentsPublicConfig,
} from './payments-config';
import { AppError } from '../../middleware/error.middleware';
import { ok, created } from '../../utils/response';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /payments/config — public feature flags for mobile */
export async function getConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await getPaymentsPublicConfig());
  } catch (err) {
    next(err);
  }
}

/** GET /payments/currencies */
export async function getCurrencies(_req: Request, res: Response, next: NextFunction) {
  try {
    await currencyService.ensureSeeded();
    const rows = await currencyService.listActive();
    ok(res, rows);
  } catch (err) {
    next(err);
  }
}

/** GET /payments/withdrawal-currencies */
export async function getWithdrawalCurrencies(_req: Request, res: Response, next: NextFunction) {
  try {
    await currencyService.ensureSeeded();
    const rows = await currencyService.listWithdrawalCurrencies();
    ok(res, rows);
  } catch (err) {
    next(err);
  }
}

/** GET /payments/currencies/:countryCode */
export async function getCurrencyByCountry(req: Request, res: Response, next: NextFunction) {
  try {
    await currencyService.ensureSeeded();
    const row = await currencyService.getByCountryCode(req.params.countryCode);
    ok(res, row);
  } catch (err) {
    next(err);
  }
}

/** GET /payments/withdrawal-methods?countryCode=PH */
export async function getWithdrawalMethods(req: Request, res: Response, next: NextFunction) {
  try {
    const countryCode = typeof req.query.countryCode === 'string' ? req.query.countryCode : '';
    if (!countryCode) {
      throw new AppError('countryCode query is required', 400);
    }
    const data = await withdrawalPayoutService.listWithdrawalMethodsForUser(
      req.user!.id,
      countryCode,
    );
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /payments/packages?currency=USD */
export async function getPackages(req: Request, res: Response, next: NextFunction) {
  try {
    const currency = typeof req.query.currency === 'string' ? req.query.currency : 'USD';
    const data = await paymentsService.getPackages(currency);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

/** POST /payments/free-topup */
export async function claimFreeTopUp(req: Request, res: Response, next: NextFunction) {
  try {
    await assertDirectUserTopupEnabled();
    const data = await paymentsService.claimFreeTopUp(req.user!.id);
    created(res, data);
  } catch (err) {
    next(err);
  }
}

/** GET /payments/history */
export async function getPaymentHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await paymentsService.getPaymentHistory(req.user!.id, page, limit);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}
