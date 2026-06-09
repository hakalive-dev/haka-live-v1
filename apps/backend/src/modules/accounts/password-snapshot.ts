import { encrypt, decrypt } from '../../utils/encryption';

/** Persist encrypted login password for admin CS display (Account screen parity). */
export function encryptPasswordSnapshot(plaintext: string): string {
  return encrypt(plaintext);
}

/** Decrypt snapshot; returns null if empty or invalid. */
export function decryptPasswordSnapshot(snapshot: string): string | null {
  const trimmed = snapshot?.trim();
  if (!trimmed) return null;
  try {
    return decrypt(trimmed);
  } catch {
    return null;
  }
}

/**
 * Same display logic as mobile AccountScreen:
 * storedPassword ?? (hasPassword ? '••••••' : 'Not set')
 */
export function buildLoginPasswordDisplay(
  passwordSnapshot: string,
  hasPassword: boolean,
): { display: string; copyable: boolean; plaintext: string | null } {
  const plaintext = decryptPasswordSnapshot(passwordSnapshot);
  if (plaintext) {
    return { display: plaintext, copyable: true, plaintext };
  }
  if (hasPassword) {
    return { display: '••••••', copyable: false, plaintext: null };
  }
  return { display: 'Not set', copyable: false, plaintext: null };
}
