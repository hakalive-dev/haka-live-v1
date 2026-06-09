import React, { useCallback, useEffect, useReducer } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { navigationRef } from "@/navigation/navigationRef";
import { shouldShowMusicPlayerOverlayUi } from "@/navigation/roomNavigation";
import { roomsApi } from "@api/rooms";
import { useRoomSession } from "@/room/RoomSessionProvider";
import { MusicPlayerOverlay } from "@/screens/room/MusicPlayerOverlay";
import type { CurrentMusicTrack } from "@/types";

/**
 * Session-scoped music player — survives RoomScreen unmount when the user taps **Keep**.
 */
export function SessionMusicPlayer() {
  const insets = useSafeAreaInsets();
  const [, bumpNav] = useReducer((n: number) => n + 1, 0);
  const {
    session,
    music,
    musicPlayerRef,
    setMusic,
    clearMusic,
    connection,
  } = useRoomSession();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const subscribe = () => {
      if (!navigationRef.isReady()) return false;
      unsub = navigationRef.addListener("state", () => bumpNav());
      return true;
    };
    if (subscribe()) {
      return () => unsub?.();
    }
    const id = setInterval(() => {
      if (subscribe()) clearInterval(id);
    }, 80);
    return () => {
      clearInterval(id);
      unsub?.();
    };
  }, []);

  const roomId = session?.roomId ?? "";
  const ws = connection.ws ?? null;
  const showOverlayUi = shouldShowMusicPlayerOverlayUi();

  const openUserMusicLibrary = useCallback(() => {
    if (!roomId || !navigationRef.isReady()) return;
    navigationRef.navigate("RoomModal", {
      screen: "UserMusicLibrary",
      params: {
        roomId,
        onTrackPlayed: (played: CurrentMusicTrack) => {
          setMusic({ autoPlay: true, visible: true, track: played });
          setTimeout(() => musicPlayerRef.current?.expand(), 0);
        },
      },
    });
  }, [roomId, setMusic, musicPlayerRef]);

  if (!session?.roomId) return null;
  if (!music.visible && !music.track) return null;

  const canOpenLibrary = music.canControl && showOverlayUi;

  return (
    <MusicPlayerOverlay
      ref={musicPlayerRef}
      track={music.track}
      roomId={roomId}
      ws={ws}
      canControl={music.canControl}
      visible={music.visible}
      autoPlay={music.autoPlay}
      hideChrome={!showOverlayUi}
      bottomOffset={insets.bottom + 90}
      onOpenLibrary={canOpenLibrary ? openUserMusicLibrary : undefined}
      onMusicTrackChange={(played) => {
        if (played) {
          setMusic({ visible: true, track: played });
        } else {
          void clearMusic();
        }
      }}
      onSessionClose={() => {
        void clearMusic();
      }}
      onStop={async () => {
        if (!music.canControl) return;
        try {
          await roomsApi.clearMusic(roomId);
        } catch {
          /* ignore */
        }
        void clearMusic();
      }}
    />
  );
}
