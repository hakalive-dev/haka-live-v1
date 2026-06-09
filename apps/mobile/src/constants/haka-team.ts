import type { ImageSourcePropType } from 'react-native';

/**
 * Must match backend seed (`system_uid_haka_team`) / env HAKA_TEAM_USER_ID.
 */
export const HAKA_TEAM_USER_ID =
  process.env.EXPO_PUBLIC_HAKA_TEAM_USER_ID ?? 'f1111111-1111-4111-8111-111111111111';

export function isHakaTeamUserId(id: string | undefined | null): boolean {
  return !!id && id === HAKA_TEAM_USER_ID;
}

/** Subscribe with the same name as backend `FCM_TEAM_ANNOUNCEMENTS_TOPIC`. */
export const FCM_TEAM_ANNOUNCEMENTS_TOPIC =
  process.env.EXPO_PUBLIC_FCM_TEAM_ANNOUNCEMENTS_TOPIC ?? 'haka_team_announcements';

/** Inline official badge pill — shown next to "Haka Team" name in all chat surfaces. */
export const HAKA_OFFICIAL_BADGE: ImageSourcePropType =
  require('../../assets/official_badge.png');
