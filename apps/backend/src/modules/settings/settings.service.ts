import { prisma } from '../../config/prisma';
import type { UserSettings } from '@prisma/client';

function format(s: UserSettings) {
  return {
    live_room_alerts: s.liveRoomAlerts,
    message_notifications: s.messageNotifications,
    sound_enabled: s.soundEnabled,
    vibrate_enabled: s.vibrateEnabled,
    who_can_message: s.whoCanMessage,
    camera_access: s.cameraAccess,
    voice_access: s.voiceAccess,
    location_access: s.locationAccess,
    invisible_visitor: s.invisibleVisitor,
    mystery_man_live: s.mysteryManLive,
    mystery_man_rank: s.mysteryManRank,
    invisible_online: s.invisibleOnline,
    exclusive_email_notification: s.exclusiveEmailNotification,
    hide_livestream_level: s.hideLivestreamLevel,
    calls_enabled: s.callsEnabled,
    language: s.language,
    use_system_language: s.useSystemLanguage,
  };
}

const fieldMap: Record<string, keyof UserSettings> = {
  live_room_alerts: 'liveRoomAlerts',
  message_notifications: 'messageNotifications',
  sound_enabled: 'soundEnabled',
  vibrate_enabled: 'vibrateEnabled',
  who_can_message: 'whoCanMessage',
  camera_access: 'cameraAccess',
  voice_access: 'voiceAccess',
  location_access: 'locationAccess',
  invisible_visitor: 'invisibleVisitor',
  mystery_man_live: 'mysteryManLive',
  mystery_man_rank: 'mysteryManRank',
  invisible_online: 'invisibleOnline',
  exclusive_email_notification: 'exclusiveEmailNotification',
  hide_livestream_level: 'hideLivestreamLevel',
  calls_enabled: 'callsEnabled',
  language: 'language',
  use_system_language: 'useSystemLanguage',
};

export const settingsService = {
  async get(userId: string) {
    const existing = await prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return format(existing);
  },

  async update(userId: string, patch: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const col = fieldMap[key];
      if (!col) continue;
      data[col] = value;
    }
    const updated = await prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return format(updated);
  },
};
