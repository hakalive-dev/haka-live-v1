import { randomInt } from 'crypto';
import { prisma } from '../config/prisma';

export const WITHDRAWAL_ORDER_ID_LENGTH = 19;

export const WITHDRAWAL_ORDER_ID_REGEX = /^\d{19}$/;

export function isValidWithdrawalOrderId(candidate: unknown): candidate is string {
  return typeof candidate === 'string' && WITHDRAWAL_ORDER_ID_REGEX.test(candidate);
}

/** Random 19-digit numeric string (first digit 1–9, remaining digits 0–9). */
export function randomWithdrawalOrderId(): string {
  let id = String(randomInt(1, 10));
  for (let i = 0; i < WITHDRAWAL_ORDER_ID_LENGTH - 1; i++) {
    id += String(randomInt(0, 10));
  }
  return id;
}

/**
 * Generate a unique 19-digit withdrawal order ID, retrying on collision.
 */
export async function generateUniqueWithdrawalOrderId(maxRetries = 25): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const orderId = randomWithdrawalOrderId();
    const existing = await prisma.withdrawalRequest.findUnique({ where: { orderId } });
    if (!existing) return orderId;
  }
  throw new Error('Could not generate unique withdrawal order ID after retries');
}
