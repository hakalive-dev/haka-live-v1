import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
/** Legacy SecureStore key — user JSON moved to disk (see USER_CACHE_FILE). */
const USER_KEY = "user_cache_v1";
const PENDING_INVITE_CODE_KEY = "pending_invite_code_v1";
/** Set once after the first-launch clipboard check for a deferred invite code. */
const INVITE_CLIPBOARD_CHECKED_KEY = "invite_clipboard_checked_v1";
const USER_CACHE_FILE = `${FileSystem.documentDirectory ?? ""}user-session.json`;

async function readUserJsonFromDisk(): Promise<string | null> {
  if (!FileSystem.documentDirectory) return null;
  try {
    const info = await FileSystem.getInfoAsync(USER_CACHE_FILE);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(USER_CACHE_FILE);
    return raw || null;
  } catch {
    return null;
  }
}

async function writeUserJsonToDisk(userJson: string): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  if (!userJson) {
    await FileSystem.deleteAsync(USER_CACHE_FILE, { idempotent: true });
    return;
  }
  await FileSystem.writeAsStringAsync(USER_CACHE_FILE, userJson);
}

async function clearLegacyUserFromSecureStore(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch {
    /* missing key */
  }
}

export const TokenStorage = {
  getAccess: () => SecureStore.getItemAsync(ACCESS_KEY),
  getRefresh: () => SecureStore.getItemAsync(REFRESH_KEY),
  setAccess: (token: string) => SecureStore.setItemAsync(ACCESS_KEY, token),
  setRefresh: (token: string) => SecureStore.setItemAsync(REFRESH_KEY, token),
  getUserJson: async () => {
    const fromDisk = await readUserJsonFromDisk();
    if (fromDisk) return fromDisk;

    // One-time migration from SecureStore (full /auth/me payloads exceed 2048 bytes).
    const legacy = await SecureStore.getItemAsync(USER_KEY);
    if (!legacy) return null;
    await writeUserJsonToDisk(legacy);
    await clearLegacyUserFromSecureStore();
    return legacy;
  },
  setUserJson: async (userJson: string) => {
    await writeUserJsonToDisk(userJson);
    await clearLegacyUserFromSecureStore();
  },
  getPendingInviteCode: () => SecureStore.getItemAsync(PENDING_INVITE_CODE_KEY),
  setPendingInviteCode: (code: string) =>
    SecureStore.setItemAsync(PENDING_INVITE_CODE_KEY, code),
  clearPendingInviteCode: async () => {
    try {
      await SecureStore.deleteItemAsync(PENDING_INVITE_CODE_KEY);
    } catch {
      /* missing key */
    }
  },
  wasInviteClipboardChecked: async () =>
    (await SecureStore.getItemAsync(INVITE_CLIPBOARD_CHECKED_KEY)) === "1",
  markInviteClipboardChecked: () =>
    SecureStore.setItemAsync(INVITE_CLIPBOARD_CHECKED_KEY, "1"),
  clear: async () => {
    const userJson = (await readUserJsonFromDisk()) ?? (await SecureStore.getItemAsync(USER_KEY));
    if (userJson) {
      try {
        const user = JSON.parse(userJson) as { id?: string };
        if (user.id) {
          await SecureStore.deleteItemAsync(`account_display_password_${user.id}`);
        }
      } catch {
        /* ignore */
      }
    }
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await clearLegacyUserFromSecureStore();
    if (FileSystem.documentDirectory) {
      await FileSystem.deleteAsync(USER_CACHE_FILE, { idempotent: true });
    }
    try {
      await SecureStore.deleteItemAsync(PENDING_INVITE_CODE_KEY);
    } catch {
      /* */
    }
  },
};
