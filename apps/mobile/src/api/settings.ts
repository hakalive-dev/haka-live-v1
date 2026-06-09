import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from './client';
import { searchApi } from './search';
import { applyNotificationPrefs } from '../services/notifications';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AccountSecurity {
  security_level: 'low' | 'medium' | 'high';
  has_password: boolean;
  has_phone: boolean;
  has_email: boolean;
  has_google: boolean;
  phone_masked: string;
  email_masked: string;
}

export interface UserSettings {
  // Notifications
  live_room_alerts: boolean;
  message_notifications: boolean;
  sound_enabled: boolean;
  vibrate_enabled: boolean;
  who_can_message: 'everyone' | 'mutual' | 'following';
  // Privacy
  camera_access: boolean;
  voice_access: boolean;
  location_access: boolean;
  // Privileges
  invisible_visitor: boolean;
  mystery_man_live: boolean;
  mystery_man_rank: boolean;
  invisible_online: boolean;
  exclusive_email_notification: boolean;
  hide_livestream_level: boolean;
  // Call preference
  calls_enabled: boolean;
  // Language
  language: string;
  use_system_language: boolean;
}

export interface DeviceEntry {
  id: string;
  deviceId: string;
  deviceModel: string;
  platform: string;
  appVersion: string;
  lastLoginAt: string;
  createdAt: string;
}

export interface BlockedUserEntry {
  id: string;
  blocked_id: string;
  displayName: string;
  avatar: string | null;
  hakaId: string;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
  created_at: string;
}

// ── Device permission helpers ────────────────────────────────────────────────
// Each helper returns whether the OS-level permission is currently granted.
// `request: true` triggers the OS prompt; `request: false` only checks current state.

async function syncCameraPermission(request: boolean): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (!request || !current.canAskAgain) return false;
  const next = await ImagePicker.requestCameraPermissionsAsync();
  return next.granted;
}

async function syncMicrophonePermission(request: boolean): Promise<boolean> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return true;
  if (!request || !current.canAskAgain) return false;
  const next = await requestRecordingPermissionsAsync();
  return next.granted;
}

async function syncLocationPermission(request: boolean): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (!request || !current.canAskAgain) return false;
  const next = await Location.requestForegroundPermissionsAsync();
  return next.granted;
}

async function syncNotificationPermission(request: boolean): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!request || !current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

// ── API ──────────────────────────────────────────────────────────────────────

export const settingsApi = {
  // Derive account security info from /auth/me (phone/email/password presence)
  getAccountSecurity: async (): Promise<AccountSecurity> => {
    const res = await apiClient.get('/auth/me');
    const user = res.data;
    const hasPhone = !!user.phone;
    const hasEmail = !!user.email;
    const hasPassword = !!user.hasPassword;
    const securityLevel = hasPhone && hasEmail ? 'high' : hasPhone || hasEmail ? 'medium' : 'low';
    return {
      security_level: securityLevel,
      has_password: hasPassword,
      has_phone: hasPhone,
      has_email: hasEmail,
      has_google: !!user.googleLinked,
      phone_masked: user.phone ? user.phone.replace(/(\+\d{2})\d+(\d{2})$/, '$1***$2') : '',
      email_masked: user.email ? user.email.replace(/^(.).+(@.+)$/, '$1***$2') : '',
    };
  },

  changePassword: async (
    currentPassword: string,
    newPassword: string,
    accessToken: string,
  ): Promise<void> => {
    await apiClient.patch('/auth/password', {
      currentPassword: currentPassword || undefined,
      newPassword,
      accessToken,
    });
  },
  bindEmail: async (_email: string): Promise<void> => {
    throw new Error('Email binding is not yet available. Please use phone login instead.');
  },
  bindPhone: async (accessToken: string): Promise<{ phone: string }> => {
    const res = await apiClient.patch('/auth/bind-phone', { accessToken });
    return res.data;
  },

  getDevices: async (): Promise<DeviceEntry[]> => {
    const res = await apiClient.get('/auth/devices');
    return res.data ?? [];
  },

  removeDevice: async (deviceId: string): Promise<void> => {
    await apiClient.delete(`/auth/devices/${encodeURIComponent(deviceId)}`);
  },

  getSettings: async (): Promise<UserSettings> => {
    const res = await apiClient.get('/settings');
    const data = res.data as UserSettings;
    // Reconcile device-permission flags with current OS state without prompting.
    const [cam, mic, loc] = await Promise.all([
      syncCameraPermission(false),
      syncMicrophonePermission(false),
      syncLocationPermission(false),
    ]);
    const merged = { ...data, camera_access: cam, voice_access: mic, location_access: loc };
    await applyNotificationPrefs({ sound: merged.sound_enabled, vibrate: merged.vibrate_enabled });
    return merged;
  },

  updateSettings: async (data: Partial<UserSettings>): Promise<UserSettings> => {
    // For permission flags: enabling triggers the OS prompt; disabling cannot
    // revoke OS permission, so we just persist the user's intent.
    const sanitized: Partial<UserSettings> = { ...data };

    if (data.camera_access === true) {
      sanitized.camera_access = await syncCameraPermission(true);
    }
    if (data.voice_access === true) {
      sanitized.voice_access = await syncMicrophonePermission(true);
    }
    if (data.location_access === true) {
      sanitized.location_access = await syncLocationPermission(true);
    }
    if (data.message_notifications === true || data.live_room_alerts === true) {
      const granted = await syncNotificationPermission(true);
      if (!granted) {
        if (data.message_notifications === true) sanitized.message_notifications = false;
        if (data.live_room_alerts === true) sanitized.live_room_alerts = false;
      }
    }

    const res = await apiClient.patch('/settings', sanitized);
    const updated = res.data as UserSettings;
    await applyNotificationPrefs({ sound: updated.sound_enabled, vibrate: updated.vibrate_enabled });
    return updated;
  },

  // Blocklist
  getBlocklist: async (): Promise<BlockedUserEntry[]> => {
    const res = await apiClient.get('/blocklist');
    return res.data ?? [];
  },

  blockUser: async (userId: string): Promise<BlockedUserEntry> => {
    const res = await apiClient.post('/blocklist', { user_id: userId });
    return res.data;
  },

  unblockUser: async (userId: string): Promise<void> => {
    await apiClient.delete(`/blocklist/${userId}`);
  },

  searchUsersToBlock: async (
    query: string,
  ): Promise<Array<{ id: string; displayName: string; avatar: string | null; hakaId: string; activeSpecialId?: string | null; activeSpecialIdLevel?: string | null; equippedFrame?: import('../types').EquippedCosmetic | null }>> => {
    const q = query.trim();
    if (!q) return [];
    const users = await searchApi.searchUsers(q);
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      avatar: u.avatar ?? null,
      hakaId: u.hakaId ?? '',
      activeSpecialId: u.activeSpecialId ?? null,
      activeSpecialIdLevel: u.activeSpecialIdLevel ?? null,
      equippedFrame: u.equippedFrame,
    }));
  },
};
