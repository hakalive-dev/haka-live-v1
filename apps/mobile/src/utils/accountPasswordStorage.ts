import * as SecureStore from 'expo-secure-store';

function keyForUser(userId: string): string {
  return `account_display_password_${userId}`;
}

/** One-shot reveal for Account screen after login or password change (avoids stale SecureStore). */
const pendingReveal = new Map<string, string>();

export function setPendingPasswordReveal(userId: string, password: string): void {
  pendingReveal.set(userId, password);
}

export function consumePendingPasswordReveal(userId: string): string | null {
  const value = pendingReveal.get(userId) ?? null;
  pendingReveal.delete(userId);
  return value;
}

/** Save plaintext password locally so Account screen can display it (server only stores hash). */
export async function saveAccountDisplayPassword(
  userId: string,
  password: string,
): Promise<void> {
  await SecureStore.setItemAsync(keyForUser(userId), password);
}

export async function getAccountDisplayPassword(userId: string): Promise<string | null> {
  return SecureStore.getItemAsync(keyForUser(userId));
}

export async function clearAccountDisplayPassword(userId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(keyForUser(userId));
  } catch {
    /* key may not exist */
  }
}
