import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
  const hex = env.PAYMENT_ENCRYPTION_KEY;
  if (!hex) throw new Error('PAYMENT_ENCRYPTION_KEY is not set');
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns "iv:authTag:ciphertext" (all base64).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a value produced by encrypt().
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertext] = encrypted.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Mask a bank account number: ****5678
 */
export function maskBankAccount(accountNo: string): string {
  if (accountNo.length <= 4) return '****';
  return '****' + accountNo.slice(-4);
}

/**
 * Mask an epay account: use***com
 */
export function maskEpay(account: string): string {
  if (account.length <= 6) return '***';
  return account.slice(0, 3) + '***' + account.slice(-3);
}

/**
 * Mask a wallet address (BEP20 or TRC20): 0x4a2b...f2c8
 */
export function maskWalletAddress(address: string): string {
  if (address.length <= 10) return address;
  return address.slice(0, 6) + '...' + address.slice(-4);
}
