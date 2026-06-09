/** Global bean withdrawal limits (enforced in wallet.service). */
export const WITHDRAWAL_MIN_BEANS = 100_000;
export const WITHDRAWAL_DAILY_LIMIT_BEANS = 5_000_000;
/** Withdrawal amount must be divisible by this (100k, 200k, 1M all valid). */
export const WITHDRAWAL_BEAN_STEP = 10;
