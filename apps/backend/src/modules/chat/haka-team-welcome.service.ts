import { getHakaTeamUserId } from '../../constants/haka-team';
import { insertServerDirectMessage } from './chat.service';

/**
 * One-time welcome DM sent from the Haka Team system user to a member who has
 * just finished sign-up (onboarding). Plain text so it renders directly in the
 * DM thread and inbox preview — no structured payload needed.
 */
export const WELCOME_DM_MESSAGE =
  'Welcome to Haka Live! 🎉\n\n' +
  "We're thrilled to have you here. Hop into a live room, meet people from " +
  'around the world, send your first gift, and find your community.\n\n' +
  'Have fun and be kind. 💜\n— The Haka Team';

/**
 * Send the welcome DM. Safe to call once per new user (from completeOnboarding,
 * which is itself guarded against re-running). No-op if the recipient is the
 * Haka Team account itself.
 */
export async function sendWelcomeDm(
  userId: string,
  opts?: { skipRecipientNotify?: boolean },
): Promise<void> {
  const hakaTeamId = getHakaTeamUserId();
  if (!userId || userId === hakaTeamId) return;

  await insertServerDirectMessage({
    senderId: hakaTeamId,
    recipientId: userId,
    content: WELCOME_DM_MESSAGE,
    messageType: 'text',
    skipRecipientNotify: opts?.skipRecipientNotify,
  });
}

/**
 * Fire-and-forget wrapper. The welcome DM is a nice-to-have, so a failure here
 * must never block or fail the sign-up/onboarding response.
 */
export function scheduleWelcomeDm(userId: string): void {
  void sendWelcomeDm(userId).catch(() => {});
}
