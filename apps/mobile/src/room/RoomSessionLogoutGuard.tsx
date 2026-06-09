import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import { useRoomSession } from "./RoomSessionProvider";

/**
 * Tears down any active room session (Agora audio + room socket) the moment the
 * user becomes unauthenticated. Live audio runs over Agora independently of the
 * auth JWT and the room socket, so clearing auth alone leaves the channel joined
 * — a logged-out user could still hear and be heard. Every logout path (manual,
 * force/tag logout, token-expiry) funnels through `auth.accessToken` going null,
 * so watching that one value here covers them all.
 *
 * Must be rendered inside RoomSessionProvider so it can reach `stopSession()`.
 */
export function RoomSessionLogoutGuard(): null {
  const accessToken = useSelector((state: RootState) => state.auth.accessToken);
  const { stopSession } = useRoomSession();
  const prevTokenRef = useRef<string | null>(null);

  useEffect(() => {
    // Truthy → falsy transition = the user just logged out.
    if (prevTokenRef.current && !accessToken) {
      stopSession();
    }
    prevTokenRef.current = accessToken;
  }, [accessToken, stopSession]);

  return null;
}
