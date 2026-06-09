import { prisma } from '../../../config/prisma';
import * as settingsService from '../settings/settings.service';
import { isDirectUserTopupEnabled } from '../../payments/payments-config';

const DIRECT_TOPUP_KEY = 'payments.direct_user_topup_enabled';

const EPAY_KEY = 'coin_seller_epay';
const TRC20_KEY = 'coin_seller_usdt_trc20';
const BEP20_KEY = 'coin_seller_usdt_bep20';

function valueToString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

async function readSettingString(key: string): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row ? valueToString(row.value) : '';
}

export async function getSellerRechargeConfig() {
  const [epayEmail, usdtTrc20Address, usdtBep20Address, directUserTopupEnabled] =
    await Promise.all([
      readSettingString(EPAY_KEY),
      readSettingString(TRC20_KEY),
      readSettingString(BEP20_KEY),
      isDirectUserTopupEnabled(),
    ]);

  return {
    epay_email: epayEmail,
    usdt_trc20_address: usdtTrc20Address,
    usdt_bep20_address: usdtBep20Address,
    direct_user_topup_enabled: directUserTopupEnabled,
  };
}

export async function updateSellerRechargeConfig(
  adminId: string,
  input: {
    epay_email: string;
    usdt_trc20_address: string;
    usdt_bep20_address: string;
    direct_user_topup_enabled: boolean;
  },
  ipAddress?: string,
) {
  const epay = input.epay_email.trim();
  const trc20 = input.usdt_trc20_address.trim();
  const bep20 = input.usdt_bep20_address.trim();

  await settingsService.upsertSetting(adminId, EPAY_KEY, epay, ipAddress);
  await settingsService.upsertSetting(adminId, TRC20_KEY, trc20, ipAddress);
  await settingsService.upsertSetting(adminId, BEP20_KEY, bep20, ipAddress);
  await settingsService.upsertSetting(
    adminId,
    DIRECT_TOPUP_KEY,
    input.direct_user_topup_enabled,
    ipAddress,
  );

  return getSellerRechargeConfig();
}
