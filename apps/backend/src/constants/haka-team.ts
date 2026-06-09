import { env } from '../config/env';

/** Default UUID for seeded Haka Team user (`supabaseUid`: system_uid_haka_team). Override via HAKA_TEAM_USER_ID. */
export const DEFAULT_HAKA_TEAM_USER_ID = 'f1111111-1111-4111-8111-111111111111';

export function getHakaTeamUserId(): string {
  return env.HAKA_TEAM_USER_ID ?? DEFAULT_HAKA_TEAM_USER_ID;
}

export function isHakaTeamUserId(userId: string | undefined | null): boolean {
  if (!userId) return false;
  return userId === getHakaTeamUserId();
}
