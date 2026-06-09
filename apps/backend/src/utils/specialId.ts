import { prisma } from '../config/prisma';

// 6-digit numeric Special ID — the value is rendered inside the SVGA/PNG
// template asset. Distinct from the 9-digit auto-generated User.hakaId namespace,
// so the two cannot collide by format.
export const SPECIAL_ID_REGEX = /^\d{6}$/;

export function isValidSpecialIdFormat(candidate: unknown): candidate is string {
  return typeof candidate === 'string' && SPECIAL_ID_REGEX.test(candidate);
}

export function assertValidSpecialIdFormat(candidate: unknown): string {
  if (!isValidSpecialIdFormat(candidate)) {
    throw new Error('Special ID must be exactly 6 digits (0-9)');
  }
  return candidate;
}

/**
 * Generate a random 6-digit number string, retrying on collision.
 */
export async function generateUniqueSpecialIdNumber(maxRetries = 20): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const num = String(Math.floor(100_000 + Math.random() * 900_000)); // 100000–999999
    const existing = await prisma.specialId.findUnique({ where: { number: num } });
    if (!existing) return num;
  }
  throw new Error('Could not generate unique Special ID number after retries');
}

/**
 * Check if a 6-digit number is already taken by any SpecialId record.
 */
export async function isSpecialIdNumberTaken(number: string, ignoreId?: string): Promise<boolean> {
  const existing = await prisma.specialId.findUnique({ where: { number } });
  if (!existing) return false;
  if (ignoreId && existing.id === ignoreId) return false;
  return true;
}
