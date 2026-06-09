import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { normalizeAuthPhone } from '../accounts/accounts.service';
import { sendOtp } from './whatsapp.service';

// ── Tunables ─────────────────────────────────────────────────────────────────
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes (matches template footer)
const RESEND_COOLDOWN_MS = 30 * 1000; // min gap between sends to one number
const MAX_ATTEMPTS = 5; // wrong-guess cap per active OTP
const BCRYPT_ROUNDS = 10; // matches admin emergency OTP

function generateOtpCode(): string {
  // 6 digits, zero-padded (VerifyScreen UI is 6-cell).
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Generate, store (bcrypt-hashed), and send a fresh OTP to `phone` via WhatsApp.
 * Enforces a per-number resend cooldown and invalidates any prior active codes.
 */
export async function requestOtp(phone: string): Promise<{ expiresAt: string }> {
  const normalized = normalizeAuthPhone(phone);
  if (!normalized) throw new AppError('A valid phone number is required', 400);

  // Cooldown: block rapid resends to the same number.
  const recent = await prisma.phoneOtp.findFirst({
    where: { phone: normalized, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (recent) {
    throw new AppError('Please wait a moment before requesting another code.', 429);
  }

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Invalidate prior active OTPs — only one live code per number at a time.
  await prisma.phoneOtp.updateMany({
    where: { phone: normalized, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  await prisma.phoneOtp.create({ data: { phone: normalized, codeHash, expiresAt } });

  // Send last — if Meta rejects, the row exists but the user just retries (cooldown applies).
  await sendOtp(normalized, code);

  return { expiresAt: expiresAt.toISOString() };
}

/**
 * Verify a submitted code against the latest active OTP for `phone`.
 * Marks the OTP used on success; increments attempts and locks after MAX_ATTEMPTS.
 * Returns the normalized phone (so callers reuse the same identity key) or throws.
 */
export async function verifyOtp(phone: string, code: string): Promise<string> {
  const normalized = normalizeAuthPhone(phone);
  if (!normalized) throw new AppError('A valid phone number is required', 400);

  const latest = await prisma.phoneOtp.findFirst({
    where: { phone: normalized, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest) throw new AppError('Invalid or expired code', 401);

  if (latest.attempts >= MAX_ATTEMPTS) {
    // Burn it so a fresh code must be requested.
    await prisma.phoneOtp.update({ where: { id: latest.id }, data: { usedAt: new Date() } });
    throw new AppError('Too many incorrect attempts. Request a new code.', 429);
  }

  const valid = await bcrypt.compare(code, latest.codeHash);
  if (!valid) {
    await prisma.phoneOtp.update({
      where: { id: latest.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError('Invalid or expired code', 401);
  }

  await prisma.phoneOtp.update({ where: { id: latest.id }, data: { usedAt: new Date() } });
  return normalized;
}
