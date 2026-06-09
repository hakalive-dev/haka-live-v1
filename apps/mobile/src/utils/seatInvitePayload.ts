import type { SeatInvitationPayload } from '../components/SeatInvitePrompt';

/** Normalize socket / API seat-invite payload. */
export function normalizeSeatInvitationPayload(
  raw: Partial<SeatInvitationPayload> | null | undefined,
): SeatInvitationPayload | null {
  if (!raw?.roomId || typeof raw.position !== 'number' || Number.isNaN(raw.position)) {
    return null;
  }
  return {
    roomId: raw.roomId,
    roomTitle: raw.roomTitle ?? 'Live room',
    roomCode: raw.roomCode ?? null,
    coverImage: raw.coverImage ?? null,
    roomMode: raw.roomMode === 'live' ? 'live' : 'chat',
    position: raw.position,
    fromUser: raw.fromUser ?? null,
  };
}

/** Build payload from FCM / Expo notification data (all string values). */
export function seatInvitationFromPushData(
  data: Record<string, string | undefined> | null | undefined,
): SeatInvitationPayload | null {
  if (!data || data.type !== 'room_seat_invite') return null;
  const roomId = data.roomId;
  const positionRaw = data.position;
  if (!roomId || positionRaw === undefined || positionRaw === '') return null;
  const position = Number(positionRaw);
  if (!Number.isFinite(position)) return null;

  const fromUserId = data.fromUserId;
  const fromUserDisplayName = data.fromUserDisplayName;
  const fromUser =
    fromUserId && fromUserDisplayName
      ? {
          id: fromUserId,
          displayName: fromUserDisplayName,
          avatar: data.fromUserAvatar || null,
        }
      : null;

  return {
    roomId,
    roomTitle: data.roomTitle ?? 'Live room',
    roomCode: data.roomCode || null,
    coverImage: data.coverImage || null,
    position,
    fromUser,
  };
}
