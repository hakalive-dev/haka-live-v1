import { buildInviteUrl } from "./buildInviteUrl";

export function buildInviteShareMessage(hakaId: string): string {
  return `Join me on Haka Live! Tap to join: ${buildInviteUrl(hakaId)}\n\nOr enter my Haka ID when you sign up: ${hakaId}`;
}
