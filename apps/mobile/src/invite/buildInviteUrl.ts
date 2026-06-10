/** Canonical public web origin for invite links (App Links verified host). */
export const INVITE_LINK_ORIGIN = "https://www.hakalive.com";

/**
 * Build the shareable invite URL for an inviter's Haka ID.
 * Round-trips through `extractInviteCodeFromUrl` (parses `?code=`).
 */
export function buildInviteUrl(hakaId: string): string {
  return `${INVITE_LINK_ORIGIN}/invite?code=${encodeURIComponent(hakaId)}`;
}
