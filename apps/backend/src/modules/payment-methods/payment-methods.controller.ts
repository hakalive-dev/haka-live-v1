import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { findPayoutMethod } from '../../shared-types/withdrawal-payout-methods';
import * as service from './payment-methods.service';
import { ok, created } from '../../utils/response';

const countryProviderBase = {
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  provider: z.string().trim().min(1).max(64),
  nickname: z.string().max(30).default(''),
  accountLabel: z.string().max(80).optional(),
};

const bindEpaySchema = z.object({
  ...countryProviderBase,
  methodType: z.literal('epay'),
  epayAccount: z.string().min(1, 'Epay account is required'),
  confirmEpayAccount: z.string().min(1),
});

const bindBinanceBep20Schema = z.object({
  ...countryProviderBase,
  methodType: z.literal('binance_bep20'),
  bep20Address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid BEP20 address'),
  confirmBep20Address: z.string(),
});

const bindUsdtTrc20Schema = z.object({
  ...countryProviderBase,
  methodType: z.literal('usdt_trc20'),
  trc20Address: z.string().regex(/^T[a-zA-Z0-9]{33}$/, 'Invalid TRC20 address'),
  confirmTrc20Address: z.string(),
});

const bindBankAccountSchema = z.object({
  ...countryProviderBase,
  methodType: z.literal('bank_account'),
  bankAccountNo: z.string().min(6),
  confirmAccountNo: z.string(),
  bankName: z.string().optional(),
  accountHolderName: z.string().min(1),
  ifscCode: z.string().optional(),
  countryName: z.string().optional(),
});

const bindMobileWalletSchema = z.object({
  ...countryProviderBase,
  methodType: z.literal('mobile_wallet'),
  accountNo: z.string().min(4),
  confirmAccountNo: z.string(),
  accountHolderName: z.string().optional(),
});

const bindUpiSchema = z.object({
  ...countryProviderBase,
  methodType: z.literal('upi'),
  vpa: z.string().min(3),
  confirmVpa: z.string(),
  accountHolderName: z.string().optional(),
});

const bindSchema = z.discriminatedUnion('methodType', [
  bindEpaySchema,
  bindBinanceBep20Schema,
  bindUsdtTrc20Schema,
  bindBankAccountSchema,
  bindMobileWalletSchema,
  bindUpiSchema,
]).superRefine((data, ctx) => {
  const mismatch = (path: string[], message: string) => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  };

  switch (data.methodType) {
    case 'epay':
      if (data.epayAccount !== data.confirmEpayAccount) {
        mismatch(['confirmEpayAccount'], 'Epay accounts do not match');
      }
      break;
    case 'binance_bep20':
      if (data.bep20Address !== data.confirmBep20Address) {
        mismatch(['confirmBep20Address'], 'BEP20 addresses do not match');
      }
      break;
    case 'usdt_trc20':
      if (data.trc20Address !== data.confirmTrc20Address) {
        mismatch(['confirmTrc20Address'], 'TRC20 addresses do not match');
      }
      break;
    case 'bank_account':
      if (data.bankAccountNo !== data.confirmAccountNo) {
        mismatch(['confirmAccountNo'], 'Account numbers do not match');
      }
      {
        const entry = findPayoutMethod(data.countryCode, data.provider);
        if (entry?.provider === 'bank_inr' && !data.ifscCode?.trim()) {
          mismatch(['ifscCode'], 'IFSC code is required for Indian bank transfers');
        }
        if (entry?.provider !== 'sepa_iban' && !data.bankName?.trim()) {
          mismatch(['bankName'], 'Bank name is required');
        }
      }
      break;
    case 'mobile_wallet':
      if (data.accountNo !== data.confirmAccountNo) {
        mismatch(['confirmAccountNo'], 'Account numbers do not match');
      }
      break;
    case 'upi':
      if (data.vpa !== data.confirmVpa) {
        mismatch(['confirmVpa'], 'UPI IDs do not match');
      }
      break;
  }
});

/** GET /payments/methods */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listMethods(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /payments/methods/bind */
export async function bind(req: Request, res: Response, next: NextFunction) {
  try {
    const input = bindSchema.parse(req.body);
    const base = {
      countryCode: input.countryCode,
      provider: input.provider,
      nickname: input.nickname,
      accountLabel: input.accountLabel,
    };

    let serviceInput: Parameters<typeof service.bindMethod>[1];

    switch (input.methodType) {
      case 'epay':
        serviceInput = { ...base, methodType: 'epay', epayAccount: input.epayAccount };
        break;
      case 'binance_bep20':
        serviceInput = { ...base, methodType: 'binance_bep20', bep20Address: input.bep20Address };
        break;
      case 'usdt_trc20':
        serviceInput = { ...base, methodType: 'usdt_trc20', trc20Address: input.trc20Address };
        break;
      case 'bank_account':
        serviceInput = {
          ...base,
          methodType: 'bank_account',
          bankAccountNo: input.bankAccountNo,
          bankName: input.bankName?.trim() || (input.provider === 'sepa_iban' ? 'SEPA' : ''),
          accountHolderName: input.accountHolderName,
          ifscCode: input.ifscCode,
          countryName: input.countryName,
        };
        break;
      case 'mobile_wallet':
        serviceInput = {
          ...base,
          methodType: 'mobile_wallet',
          accountNo: input.accountNo,
          accountHolderName: input.accountHolderName,
        };
        break;
      case 'upi':
        serviceInput = {
          ...base,
          methodType: 'upi',
          vpa: input.vpa,
          accountHolderName: input.accountHolderName?.trim() || undefined,
        };
        break;
      default:
        throw new Error('Unsupported method');
    }

    const data = await service.bindMethod(req.user!.id, serviceInput);
    created(res, data, 'Payment method bound successfully');
  } catch (err) { next(err); }
}

/** PUT /payments/methods/:id/default */
export async function setDefault(req: Request, res: Response, next: NextFunction) {
  try {
    await service.setDefault(req.user!.id, req.params.id);
    ok(res, null, 'Default payment method updated');
  } catch (err) { next(err); }
}

/** DELETE /payments/methods/:id */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteMethod(req.user!.id, req.params.id);
    ok(res, null, 'Payment method removed');
  } catch (err) { next(err); }
}

/** GET /payments/methods/has-method */
export async function hasMethod(req: Request, res: Response, next: NextFunction) {
  try {
    const hasBound = await service.hasPaymentMethod(req.user!.id);
    ok(res, { hasBound });
  } catch (err) { next(err); }
}
