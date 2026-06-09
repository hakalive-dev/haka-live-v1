/** Brand colors + monogram for payout providers without a raster/SVG logo asset. */
export interface PayoutProviderBrand {
  backgroundColor: string;
  foregroundColor: string;
  monogram: string;
}

export const PAYOUT_PROVIDER_BRANDS: Record<string, PayoutProviderBrand> = {
  upi: { backgroundColor: '#097939', foregroundColor: '#FFFFFF', monogram: 'UPI' },
  bank_inr: { backgroundColor: '#1A3A6B', foregroundColor: '#FFFFFF', monogram: 'IN' },
  mpesa: { backgroundColor: '#4CAF50', foregroundColor: '#FFFFFF', monogram: 'M' },
  esewa: { backgroundColor: '#60BB46', foregroundColor: '#FFFFFF', monogram: 'eS' },
  khalti: { backgroundColor: '#5C2D91', foregroundColor: '#FFFFFF', monogram: 'K' },
  bank_npr: { backgroundColor: '#003893', foregroundColor: '#FFFFFF', monogram: 'NP' },
  bank_ngn: { backgroundColor: '#008751', foregroundColor: '#FFFFFF', monogram: 'NG' },
  opay: { backgroundColor: '#1DCF9F', foregroundColor: '#0B0B14', monogram: 'O' },
  palmpay: { backgroundColor: '#6B2FD4', foregroundColor: '#FFFFFF', monogram: 'P' },
  easypaisa: { backgroundColor: '#00A651', foregroundColor: '#FFFFFF', monogram: 'EP' },
  jazzcash: { backgroundColor: '#EE3424', foregroundColor: '#FFFFFF', monogram: 'JC' },
  bank_pkr: { backgroundColor: '#01411C', foregroundColor: '#FFFFFF', monogram: 'PK' },
  gcash: { backgroundColor: '#007DFE', foregroundColor: '#FFFFFF', monogram: 'G' },
  maya: { backgroundColor: '#00B14F', foregroundColor: '#FFFFFF', monogram: 'M' },
  bank_php: { backgroundColor: '#0038A8', foregroundColor: '#FFFFFF', monogram: 'PH' },
  payshap: { backgroundColor: '#E03C31', foregroundColor: '#FFFFFF', monogram: 'PS' },
  bank_vnd: { backgroundColor: '#DA251D', foregroundColor: '#FFFFFF', monogram: 'VN' },
  momo: { backgroundColor: '#A50064', foregroundColor: '#FFFFFF', monogram: 'Mo' },
  bkash: { backgroundColor: '#E2136E', foregroundColor: '#FFFFFF', monogram: 'bK' },
  nagad: { backgroundColor: '#F6921E', foregroundColor: '#FFFFFF', monogram: 'N' },
  whish_lbp_usd: { backgroundColor: '#7B4FFF', foregroundColor: '#FFFFFF', monogram: 'W' },
  local_office_syp_usd: { backgroundColor: '#4DA6FF', foregroundColor: '#FFFFFF', monogram: 'SY' },
  local_office_lyd_usd: { backgroundColor: '#E8A020', foregroundColor: '#0B0B14', monogram: 'LY' },
  usdt_trc20: { backgroundColor: '#26A17B', foregroundColor: '#FFFFFF', monogram: '₮' },
  usdt_bep20: { backgroundColor: '#F0B90B', foregroundColor: '#0B0B14', monogram: 'BEP' },
  epay: { backgroundColor: '#7B4FFF', foregroundColor: '#FFFFFF', monogram: 'E' },
  telebirr: { backgroundColor: '#7B2D8E', foregroundColor: '#FFFFFF', monogram: 'Tb' },
  cbe_birr: { backgroundColor: '#7D2B8E', foregroundColor: '#FFFFFF', monogram: 'CB' },
  awash_bank: { backgroundColor: '#F47B20', foregroundColor: '#FFFFFF', monogram: 'AW' },
  abyssinia_bank: { backgroundColor: '#C41230', foregroundColor: '#FFFFFF', monogram: 'AB' },
  mtn_momo: { backgroundColor: '#FFCC00', foregroundColor: '#0B0B14', monogram: 'MTN' },
  vodafone_cash: { backgroundColor: '#E60000', foregroundColor: '#FFFFFF', monogram: 'V' },
  sepa_iban: { backgroundColor: '#003399', foregroundColor: '#FFCC00', monogram: 'EU' },
};
