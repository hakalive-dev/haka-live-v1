import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRoomConnection, type RoomWsEvent } from "@/hooks/useRoomConnection";
import type { MusicPlayerHandle } from "@/screens/room/MusicPlayerOverlay";
import type { CurrentMusicTrack } from "@/types";

/** Snapshot for the floating mini-player + reopening RoomModal after Keep. */
export type KeptRoomDisplay = {
  title: string;
  /** Room cover / list image (shown on top of theme when both exist). */
  coverUrl: string | null;
  /** Active theme background image (room atmosphere), if any. */
  backgroundImageUrl?: string | null;
  /** Theme gradient fallback when no images are available. */
  gradientFrom?: string;
  gradientTo?: string;
  roomMode: "live" | "chat";
  isLocked?: boolean;
  hostId?: string;
  /** Seat index when the user was on mic — used to leaveSeat on full dismiss. */
  seatPosition: number | null;
};

type RoomSessionConfig = {
  roomId: string;
  canPublish: boolean;
  enabled: boolean;
  publishVideo: boolean;
  subscribeVideo: boolean;
  roomPassword?: string | null;
  /** True when the current user is seated and the host muted this seat (Agora must stay unpublished). */
  seatMutedByHost?: boolean;
  keptDisplay?: KeptRoomDisplay;
  /** Incremented when foregrounding after Keep — triggers room:join on an existing socket. */
  rejoinGeneration?: number;
};

export type KeepInBackgroundOptions = {
  /** If true, keep audio publishing enabled (mic stays live); video is always disabled. */
  preservePublishing?: boolean;
  display: KeptRoomDisplay;
};

export type MusicSessionState = {
  track: CurrentMusicTrack | null;
  visible: boolean;
  autoPlay: boolean;
  canControl: boolean;
};

const DEFAULT_MUSIC: MusicSessionState = {
  track: null,
  visible: false,
  autoPlay: true,
  canControl: false,
};

type RoomSessionContextValue = {
  session: RoomSessionConfig | null;
  isBackground: boolean;
  music: MusicSessionState;
  musicPlayerRef: React.RefObject<MusicPlayerHandle | null>;
  setMusic: (patch: Partial<MusicSessionState>) => void;
  clearMusic: () => Promise<void>;
  setForegroundSession: (cfg: RoomSessionConfig, onWsEvent?: (e: RoomWsEvent) => void) => void;
  /** Keep the latest RoomScreen WS handler without re-rendering the provider (socket uses a stable bridge). */
  syncRoomWsHandler: (handler?: (e: RoomWsEvent) => void) => void;
  keepInBackground: (opts: KeepInBackgroundOptions) => void;
  stopSession: () => void;
  connection: ReturnType<typeof useRoomConnection>;
};

const RoomSessionContext = createContext<RoomSessionContextValue | null>(null);

export function RoomSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<RoomSessionConfig | null>(null);
  const [isBackground, setIsBackground] = useState(false);
  const [music, setMusicState] = useState<MusicSessionState>(DEFAULT_MUSIC);
  const musicPlayerRef = useRef<MusicPlayerHandle | null>(null);
  const isBackgroundRef = useRef(false);
  const onWsEventRef = useRef<((e: RoomWsEvent) => void) | undefined>(undefined);

  const setMusic = useCallback((patch: Partial<MusicSessionState>) => {
    setMusicState((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearMusic = useCallback(async () => {
    await musicPlayerRef.current?.stopAudio();
    setMusicState(DEFAULT_MUSIC);
  }, []);

  /** Stable — socket listeners call this; it forwards to the latest RoomScreen handler ref. */
  const dispatchRoomWsEvent = useCallback((e: RoomWsEvent) => {
    onWsEventRef.current?.(e);
  }, []);

  const syncRoomWsHandler = useCallback((handler?: (e: RoomWsEvent) => void) => {
    onWsEventRef.current = handler;
  }, []);

  const setForegroundSession = useCallback(
    (cfg: RoomSessionConfig, onWsEvent?: (e: RoomWsEvent) => void) => {
      onWsEventRef.current = onWsEvent;
      const returningFromKeep = isBackgroundRef.current;
      isBackgroundRef.current = false;
      setIsBackground(false);
      setSession((prev) => ({
        ...cfg,
        keptDisplay: undefined,
        rejoinGeneration: returningFromKeep
          ? (prev?.rejoinGeneration ?? 0) + 1
          : (cfg.rejoinGeneration ?? prev?.rejoinGeneration ?? 0),
      }));
    },
    [],
  );

  const keepInBackground = useCallback((opts: KeepInBackgroundOptions) => {
    const preservePublishing = Boolean(opts.preservePublishing);
    const { display } = opts;
    // Keep WS + Agora alive, but ensure video is disabled. Optionally keep mic publishing.
    isBackgroundRef.current = true;
    setIsBackground(true);
    onWsEventRef.current = undefined;
    setSession((prev) =>
      prev
        ? {
            ...prev,
            canPublish: preservePublishing ? prev.canPublish : false,
            publishVideo: false,
            subscribeVideo: false,
            enabled: true,
            keptDisplay: display,
          }
        : prev,
    );
  }, []);

  const stopSession = useCallback(() => {
    onWsEventRef.current = undefined;
    isBackgroundRef.current = false;
    setIsBackground(false);
    void musicPlayerRef.current?.stopAudio();
    setMusicState(DEFAULT_MUSIC);
    setSession(null);
  }, []);

  const connection = useRoomConnection({
    roomId: session?.roomId ?? "",
    canPublish: session?.canPublish ?? false,
    enabled: session?.enabled ?? false,
    publishVideo: session?.publishVideo ?? false,
    subscribeVideo: session?.subscribeVideo ?? false,
    roomPassword: session?.roomPassword ?? null,
    seatMutedByHost: session?.seatMutedByHost ?? false,
    rejoinGeneration: session?.rejoinGeneration ?? 0,
    onWsEvent: dispatchRoomWsEvent,
  });

  const value = useMemo<RoomSessionContextValue>(
    () => ({
      session,
      isBackground,
      music,
      musicPlayerRef,
      setMusic,
      clearMusic,
      setForegroundSession,
      syncRoomWsHandler,
      keepInBackground,
      stopSession,
      connection,
    }),
    [session, isBackground, music, setMusic, clearMusic, setForegroundSession, syncRoomWsHandler, keepInBackground, stopSession, connection],
  );

  return (
    <RoomSessionContext.Provider value={value}>
      {children}
    </RoomSessionContext.Provider>
  );
}

export function useRoomSession(): RoomSessionContextValue {
  const ctx = useContext(RoomSessionContext);
  if (!ctx) {
    throw new Error("useRoomSession must be used within RoomSessionProvider");
  }
  return ctx;
}

