import type { ComponentType } from 'react';
import type { ImageSourcePropType } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import UpiIcon from '../../../assets/payment-methods/upi.svg';
import EpayIcon from '../../../assets/payment-methods/epay.svg';
import UsdcIcon from '../../../assets/payment-methods/usdc.svg';
import BankTransferIcon from '../../../assets/payment-methods/bank-transfer.svg';

import GcashIcon from '../../../assets/payment-methods/providers/gcash.svg';
import MayaIcon from '../../../assets/payment-methods/providers/maya.svg';
import MpesaIcon from '../../../assets/payment-methods/providers/mpesa.svg';
import BkashIcon from '../../../assets/payment-methods/providers/bkash.svg';
import NagadIcon from '../../../assets/payment-methods/providers/nagad.svg';
import MomoIcon from '../../../assets/payment-methods/providers/momo.svg';
import UsdtTrc20Icon from '../../../assets/payment-methods/providers/usdt_trc20.svg';
import UsdtBep20Icon from '../../../assets/payment-methods/providers/usdt_bep20.svg';
import VodafoneCashIcon from '../../../assets/payment-methods/providers/vodafone_cash.svg';
import SepaIbanIcon from '../../../assets/payment-methods/providers/sepa_iban.svg';
import MtnMomoIcon from '../../../assets/payment-methods/providers/mtn_momo.svg';

import EasypaisaPng from '../../../assets/payment-methods/providers/easypaisa.png';
import JazzcashPng from '../../../assets/payment-methods/providers/jazzcash.png';
import EsewaWebp from '../../../assets/payment-methods/providers/esewa.webp';
import TelebirrPng from '../../../assets/payment-methods/providers/telebirr.png';
import KhaltiPng from '../../../assets/payment-methods/providers/khalti.png';
import AwashBankPng from '../../../assets/payment-methods/providers/awash_bank.png';
import AbyssiniaBankPng from '../../../assets/payment-methods/providers/abyssinia_bank.png';
import CbeBirrPlaceholder from '../../../assets/payment-methods/providers/cbe_birr.svg';
import OpayPng from '../../../assets/payment-methods/providers/opay.png';
import PalmpayPng from '../../../assets/payment-methods/providers/palmpay.png';

// Placeholder SVGs (text-on-color) — remittance / rails without a public logo yet
import WhishIcon from '../../../assets/payment-methods/providers/whish_lbp_usd.svg';
import LocalOfficeSypIcon from '../../../assets/payment-methods/providers/local_office_syp_usd.svg';
import LocalOfficeLydIcon from '../../../assets/payment-methods/providers/local_office_lyd_usd.svg';
import PayshapIcon from '../../../assets/payment-methods/providers/payshap.svg';

export type PayoutSvgIcon = ComponentType<{ width?: number; height?: number } & SvgProps>;

/** Bundled raster logos (Wikipedia / Commons / official favicon). */
export const PAYOUT_PROVIDER_RASTER: Record<string, ImageSourcePropType> = {
  easypaisa: EasypaisaPng,
  jazzcash: JazzcashPng,
  esewa: EsewaWebp,
  telebirr: TelebirrPng,
  khalti: KhaltiPng,
  awash_bank: AwashBankPng,
  abyssinia_bank: AbyssiniaBankPng,
  opay: OpayPng,
  palmpay: PalmpayPng,
};

/** Wide horizontal wordmarks — render with extra padding in the icon tile. */
export const PAYOUT_WORDMARK_PROVIDERS = new Set([
  'gcash',
  'maya',
  'mpesa',
  'easypaisa',
  'jazzcash',
  'esewa',
  'bkash',
  'nagad',
  'telebirr',
  'khalti',
  'awash_bank',
  'abyssinia_bank',
  'cbe_birr',
  'mtn_momo',
  'opay',
  'palmpay',
]);

/** Vector logos keyed by payout `provider` id. */
export const PAYOUT_PROVIDER_SVG_ICONS: Record<string, PayoutSvgIcon> = {
  upi: UpiIcon,
  epay: EpayIcon,
  usdt_trc20: UsdtTrc20Icon,
  usdt_bep20: UsdtBep20Icon,
  gcash: GcashIcon,
  maya: MayaIcon,
  mpesa: MpesaIcon,
  bkash: BkashIcon,
  nagad: NagadIcon,
  momo: MomoIcon,
  mtn_momo: MtnMomoIcon,
  vodafone_cash: VodafoneCashIcon,
  sepa_iban: SepaIbanIcon,
  whish_lbp_usd: WhishIcon,
  local_office_syp_usd: LocalOfficeSypIcon,
  local_office_lyd_usd: LocalOfficeLydIcon,
  payshap: PayshapIcon,
  cbe_birr: CbeBirrPlaceholder,
  bank_inr: BankTransferIcon,
  bank_npr: BankTransferIcon,
  bank_ngn: BankTransferIcon,
  bank_pkr: BankTransferIcon,
  bank_php: BankTransferIcon,
  bank_vnd: BankTransferIcon,
  usdc: UsdcIcon,
};

const BANK_PROVIDER_PREFIX = 'bank_';

export function resolvePayoutRasterIcon(provider: string): ImageSourcePropType | undefined {
  return PAYOUT_PROVIDER_RASTER[provider.toLowerCase()];
}

export function resolvePayoutSvgIcon(
  provider: string,
  methodType?: string,
): PayoutSvgIcon | undefined {
  const key = provider.toLowerCase();
  if (PAYOUT_PROVIDER_RASTER[key]) {
    return undefined;
  }
  if (PAYOUT_PROVIDER_SVG_ICONS[key]) {
    return PAYOUT_PROVIDER_SVG_ICONS[key];
  }
  if (key.startsWith(BANK_PROVIDER_PREFIX) || methodType === 'bank_account') {
    return BankTransferIcon;
  }
  return undefined;
}
