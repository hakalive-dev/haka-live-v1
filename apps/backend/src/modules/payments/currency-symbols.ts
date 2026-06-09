/** Common ISO 4217 currency symbols (fallback: currency code). */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CNY: '¥',
  KRW: '₩',
  PHP: '₱',
  IDR: 'Rp',
  THB: '฿',
  VND: '₫',
  BDT: '৳',
  PKR: '₨',
  NGN: '₦',
  KES: 'KSh',
  GHS: '₵',
  ZAR: 'R',
  AED: 'د.إ',
  SAR: '﷼',
  MYR: 'RM',
  SGD: 'S$',
  HKD: 'HK$',
  TWD: 'NT$',
  AUD: 'A$',
  CAD: 'C$',
  BRL: 'R$',
  MXN: '$',
  TRY: '₺',
  EGP: '£',
  PLN: 'zł',
  CHF: 'CHF',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  NZD: 'NZ$',
  ARS: '$',
  CLP: '$',
  COP: '$',
  PEN: 'S/',
  UAH: '₴',
  RUB: '₽',
  ILS: '₪',
};

export function symbolForCurrency(currency: string, fromApi?: string): string {
  if (fromApi && fromApi.trim()) return fromApi.trim();
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
}

/** Launch markets shown to users by default after import. */
export const LAUNCH_COUNTRY_CODES = new Set([
  'IN', 'US', 'GB', 'PH', 'ID', 'BD', 'PK', 'NG', 'KE', 'GH', 'ZA',
  'AE', 'SA', 'MY', 'SG', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'BR',
  'MX', 'JP', 'KR', 'CN', 'HK', 'TW', 'VN', 'TH', 'EG', 'TR', 'PL',
  'NL', 'BE', 'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'AT', 'CZ',
  'HU', 'RO', 'UA', 'RU', 'IL', 'NZ', 'AR', 'CL', 'CO', 'PE', 'MM',
  'LK', 'NP', 'KH', 'LA', 'QA', 'KW', 'OM', 'BH', 'JO', 'LB', 'MA',
]);
