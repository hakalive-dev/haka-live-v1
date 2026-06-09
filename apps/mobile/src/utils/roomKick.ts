export interface CanKickRoomMemberParams {
  isHost: boolean;
  isRoomAdmin: boolean;
  targetUserId: string;
  hostId: string;
  roomAdminIds: ReadonlySet<string>;
  currentUserId?: string | null;
}

/** Whether the viewer may show/use in-room kick for this member (server enforces tags/super-admin). */
export function canKickRoomMember({
  isHost,
  isRoomAdmin,
  targetUserId,
  hostId,
  roomAdminIds,
  currentUserId,
}: CanKickRoomMemberParams): boolean {
  if (!currentUserId || targetUserId === currentUserId) return false;
  if (targetUserId === hostId) return false;
  if (!isHost && !isRoomAdmin) return false;
  if (isHost) return true;
  return !roomAdminIds.has(targetUserId);
}

/** User-facing copy when re-join is blocked after a kick (or temporary room ban). */
export function formatRoomKickBanMessage(cooldownMinutes?: number): string {
  if (cooldownMinutes != null && cooldownMinutes > 0) {
    const hours = Math.max(1, Math.ceil(cooldownMinutes / 60));
    return `You have been kicked from this room. Try again in about ${hours} hour${hours === 1 ? '' : 's'}.`;
  }
  return 'You have been kicked from this room. Please try again later.';
}
