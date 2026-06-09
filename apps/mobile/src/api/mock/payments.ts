import type {
  AgentSale, CoinPackage, CoinPackageLocal, CoinSeller,
  CompanyCryptoWallet, CurrencyConfig, ManualPaymentRequest,
  PaymentTransaction, UserPaymentMethod, WithdrawalRequest,
} from '@/types';

export const mockPayments = {
  currencies: [
    { id: 'cur-in', country_code: 'IN', country_name: 'India', currency_code: 'INR', currency_symbol: '₹', beans_to_currency_rate: '92', min_withdrawal_beans: 100000 },
    { id: 'cur-gb', country_code: 'GB', country_name: 'United Kingdom', currency_code: 'GBP', currency_symbol: '£', beans_to_currency_rate: '1.00', min_withdrawal_beans: 10000 },
    { id: 'cur-us', country_code: 'US', country_name: 'United States', currency_code: 'USD', currency_symbol: '$', beans_to_currency_rate: '1.20', min_withdrawal_beans: 10000 },
  ] as CurrencyConfig[],

  packages: [
    { id: 'pkg-1a2b3c', name: 'Starter',  coins: 100,    bonus_coins: 0,     total_coins: 100,    price_gbp: '0.99',  order: 1 },
    { id: 'pkg-2b3c4d', name: 'Popular',  coins: 500,    bonus_coins: 50,    total_coins: 550,    price_gbp: '4.99',  order: 2 },
    { id: 'pkg-3c4d5e', name: 'Value',    coins: 1_000,  bonus_coins: 150,   total_coins: 1_150,  price_gbp: '8.99',  order: 3 },
    { id: 'pkg-4d5e6f', name: 'Super',    coins: 2_500,  bonus_coins: 500,   total_coins: 3_000,  price_gbp: '19.99', order: 4 },
    { id: 'pkg-5e6f7a', name: 'Mega',     coins: 5_000,  bonus_coins: 1_250, total_coins: 6_250,  price_gbp: '39.99', order: 5 },
    { id: 'pkg-6f7a8b', name: 'Ultimate', coins: 10_000, bonus_coins: 3_000, total_coins: 13_000, price_gbp: '69.99', order: 6 },
  ] as CoinPackage[],

  packagesLocal: [
    { id: 'pkg-1a2b3c', name: 'Starter',  coins: 100,    bonus_coins: 0,     total_coins: 100,    price_local: '0.01',  currency_symbol: '$', order: 1 },
    { id: 'pkg-2b3c4d', name: 'Popular',  coins: 500,    bonus_coins: 50,    total_coins: 550,    price_local: '0.06',  currency_symbol: '$', order: 2 },
    { id: 'pkg-3c4d5e', name: 'Value',    coins: 1_000,  bonus_coins: 150,   total_coins: 1_150,  price_local: '0.12',  currency_symbol: '$', order: 3 },
    { id: 'pkg-4d5e6f', name: 'Super',    coins: 2_500,  bonus_coins: 500,   total_coins: 3_000,  price_local: '0.30',  currency_symbol: '$', order: 4 },
    { id: 'pkg-5e6f7a', name: 'Mega',     coins: 5_000,  bonus_coins: 1_250, total_coins: 6_250,  price_local: '0.63',  currency_symbol: '$', order: 5 },
    { id: 'pkg-6f7a8b', name: 'Ultimate', coins: 10_000, bonus_coins: 3_000, total_coins: 13_000, price_local: '1.30',  currency_symbol: '$', order: 6 },
  ] as CoinPackageLocal[],

  paymentMethods: [] as UserPaymentMethod[],

  coinSellers: [
    { id: 'cs-1', displayName: 'Raj Kumar', avatar: 'https://i.pravatar.cc/150?u=rajkumar', hakaId: 'HK123456' },
    { id: 'cs-2', displayName: 'Priya Singh', avatar: 'https://i.pravatar.cc/150?u=priyasingh', hakaId: 'HK234567' },
    { id: 'cs-3', displayName: 'Amit Patel', avatar: 'https://i.pravatar.cc/150?u=amitpatel', hakaId: 'HK345678' },
  ] as CoinSeller[],

  cryptoWallets: [
    { crypto_type: 'USDT', network: 'TRC20', wallet_address: 'TRx7F2a9K3bC5dE8f1G4h6J9k2L5m8N1p' },
    { crypto_type: 'USDC', network: 'TRC20', wallet_address: 'TRy3A8b5C2dE9f4G7h1J6k3L8m5N2p9Q' },
  ] as CompanyCryptoWallet[],

  history: [
    {
      id: 'pt-free-001', package_name: 'Free Welcome Top-Up', method: 'free' as const,
      amount_usd: 0.01, amount_gbp: '0.01',
      status: 'succeeded' as const, coins_credited: true,
      created_at: '2026-04-01T08:00:00Z', type: 'free_topup' as const,
    },
    {
      id: 'pt-9f8e7d6c', package_name: '100,050 Coins', method: 'card' as const,
      amount_usd: 10.01, amount_gbp: '7.91',
      status: 'succeeded' as const, coins_credited: true,
      created_at: '2026-04-01T14:22:00Z', type: 'purchase' as const,
    },
    {
      id: 'pt-8e7d6c5b', package_name: '200,100 Coins', method: 'google_pay' as const,
      amount_usd: 20.01, amount_gbp: '15.81',
      status: 'succeeded' as const, coins_credited: true,
      created_at: '2026-03-28T10:05:00Z', type: 'purchase' as const,
    },
  ] as PaymentTransaction[],

  withdrawals: [
    {
      id: 'wd-a1b2c3d4', beans_amount: 50_000, gbp_equivalent: '5.00',
      amount_local: '5.00', currency_code: 'USD',
      status: 'pending' as const, payment_method: null, payment_details: '',
      created_at: '2026-03-30T16:00:00Z',
    },
  ] as WithdrawalRequest[],

  agentSales: [
    {
      id: 'as-1a2b3c4d',
      customer: { id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a', username: 'yuki_chan', displayName: 'Yuki Tanaka', hakaId: 'HK563148' },
      coins_sold: 2_000, amount_collected: '15.00', currency: 'USD', notes: 'Bank transfer',
      created_at: '2026-03-29T11:30:00Z',
    },
    {
      id: 'as-2b3c4d5e',
      customer: { id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b', username: 'omar_beats', displayName: 'Omar Hassan', hakaId: 'HK654259' },
      coins_sold: 500, amount_collected: '5.00', currency: 'USD', notes: 'Cash at meetup',
      created_at: '2026-03-25T14:00:00Z',
    },
  ] as AgentSale[],

  mockIntent: {
    client_secret:     'pi_3RAbCdEfGhIjKlMn_secret_AbCdEfGhIjKl',
    payment_intent_id: 'pi_3RAbCdEfGhIjKlMn',
    transaction_id:    'tx-new-pending-001',
    amount_gbp:        '19.99',
    publishable_key:   'pk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz',
  },

  mockManualRequest: {
    id: 'mr-new',
    method: 'upi' as const,
    reference_id: 'HAKA-A1B2C3D4',
    amount_local: '1659',
    currency_code: 'INR',
    status: 'pending' as const,
    package: { id: 'pkg-4d5e6f', name: 'Super', coins: 2500, bonus_coins: 500, total_coins: 3000, price_gbp: '19.99', order: 4 },
    created_at: new Date().toISOString(),
  } as ManualPaymentRequest,
};
