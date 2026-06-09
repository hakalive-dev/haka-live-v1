import { getIO } from '../../sockets';

/** True when the user has at least one active socket in the `user:{userId}` room. */
export function isUserSocketOnline(userId: string): boolean {
  try {
    const room = getIO().sockets.adapter.rooms.get(`user:${userId}`);
    return !!room && room.size > 0;
  } catch {
    return false;
  }
}

/** Hide online status from viewers when the user enabled invisible mode (except self). */
export function shouldHideOnlineFromViewer(
  invisibleOnline: boolean,
  userId: string,
  viewerId: string | null,
): boolean {
  return invisibleOnline && viewerId !== userId;
}

/** Whether the viewer should see this user as online (socket + invisible setting). */
export function isVisibleOnlineToViewer(
  userId: string,
  viewerId: string | null,
  invisibleOnline: boolean,
): boolean {
  if (shouldHideOnlineFromViewer(invisibleOnline, userId, viewerId)) {
    return false;
  }
  return isUserSocketOnline(userId);
}
