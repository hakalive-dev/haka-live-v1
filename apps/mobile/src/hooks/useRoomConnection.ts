/**
 * useRoomConnection
 *
 * Manages two connections every room participant needs:
 *   1. Agora RTC — real-time audio/video (mic + camera).
 *      Skipped in Expo Go (native modules unavailable).
 *   2. Socket.io WebSocket — real-time room state events
 *      (seat changes, hand raises, room ended, chat messages, gifts).
 *
 * Usage:
 *   const {
 *     micEnabled, camEnabled, toggleMic, toggleCam,
 *     localUid, remoteUids, engine,
 *     wsConnected, agoraJoined,
 *     sendMessage, isExpoGo,
 *   } = useRoomConnection({ roomId, canPublish, publishVideo: true, subscribeVideo: true });
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';
import { io as ioClient, Socket as SocketIOClient } from 'socket.io-client';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { roomsApi } from '@api/rooms';
import { logDiagnostic } from '../diagnostics/releaseDiagnostics';
import { getFreshSocketToken, getSocketBaseUrl } from '../utils/socketAuth';
import { useToast } from '@components/Toast';
import {
  type SeatInvitationPayload,
} from '@components/SeatInvitePrompt';
import { normalizeSeatInvitationPayload } from '../utils/seatInvitePayload';

// Agora native modules are only available in dev-client / prod builds, not Expo Go.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Agora volume is 0–255. Real speech sits well above ambient/background noise;
// a low floor lets room music or breathing falsely trigger the speaking glow,
// so require a clear voice level before a seat is considered "speaking".
const SPEAK_VOLUME_THRESHOLD = 45;
const SPEAK_HOLD_MS = 300;
const SPEAK_THROTTLE_MS = 100;

type SpeakingEntry = { active: boolean; clearTimer?: ReturnType<typeof setTimeout> };

function isVolumeSpeakerActive(speaker: { volume?: number; vad?: number }): boolean {
  // A clear voice level is required: vad is only reported reliably for the local
  // publisher, so the volume floor is the signal we trust for every speaker.
  return (speaker.volume ?? 0) >= SPEAK_VOLUME_THRESHOLD;
}

// Deterministic 32-bit UID from a UUID — backend fallback when Redis is unavailable.
// Production RTC UIDs come from getOrAssignUid via GET /rooms/:id/token.
export function uidFromUuid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash + uuid.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export interface RoomWsEvent {
  event: string;
  data: Record<string, any>;
}

interface Options {
  roomId: string;
  canPublish: boolean;
  enabled?: boolean;
  /** Publish local camera (host in live rooms). */
  publishVideo?: boolean;
  /** Subscribe to remote video (all participants in live rooms, including listeners). */
  subscribeVideo?: boolean;
  roomPassword?: string | null;
  /** Host muted this user's seat — local track must stay muted until host unmutes. */
  seatMutedByHost?: boolean;
  /** Bumped when returning from Keep so an already-connected socket re-emits room:join. */
  rejoinGeneration?: number;
  onWsEvent?: (event: RoomWsEvent) => void;
}

export function useRoomConnection({
  roomId,
  canPublish,
  enabled = true,
  publishVideo = false,
  subscribeVideo = false,
  roomPassword,
  seatMutedByHost = false,
  rejoinGeneration = 0,
  onWsEvent,
}: Options) {
  const toast = useToast();
  const [micEnabled, setMicEnabled]     = useState(false);
  const [camEnabled, setCamEnabled]     = useState(false);
  const [agoraJoined, setAgoraJoined]   = useState(false);
  const [wsConnected, setWsConnected]   = useState(false);
  const [localUid, setLocalUid]         = useState(0);
  const [remoteUids, setRemoteUids]     = useState<number[]>([]);
  const [activeSpeakerRtcUids, setActiveSpeakerRtcUids] = useState<ReadonlySet<number>>(
    () => new Set(),
  );

  const engineRef  = useRef<any>(null);
  // Serialize the async Agora lifecycle: each effect run gets a generation; a
  // bumped generation cancels any in-flight connect, and the next connect waits
  // for the previous teardown so leave/release and init/join never interleave.
  const agoraGenRef = useRef(0);
  const agoraTeardownRef = useRef<Promise<void>>(Promise.resolve());
  const ws         = useRef<SocketIOClient | null>(null);
  const roomPasswordRef = useRef(roomPassword);
  roomPasswordRef.current = roomPassword;
  const onWsRef    = useRef(onWsEvent);
  onWsRef.current  = onWsEvent;
  const localUidRef = useRef(0);
  const speakingEntriesRef = useRef<Map<number, SpeakingEntry>>(new Map());
  const lastSpeakFlushRef = useRef(0);
  const speakFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSpeakingState = useCallback(() => {
    for (const entry of speakingEntriesRef.current.values()) {
      if (entry.clearTimer) clearTimeout(entry.clearTimer);
    }
    speakingEntriesRef.current.clear();
    if (speakFlushTimerRef.current) {
      clearTimeout(speakFlushTimerRef.current);
      speakFlushTimerRef.current = null;
    }
    setActiveSpeakerRtcUids(new Set());
  }, []);

  const flushSpeakingUids = useCallback(() => {
    const next = new Set<number>();
    for (const [uid, entry] of speakingEntriesRef.current) {
      if (entry.active) next.add(uid);
    }
    setActiveSpeakerRtcUids(next);
  }, []);

  const scheduleSpeakingFlush = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastSpeakFlushRef.current;
    if (elapsed >= SPEAK_THROTTLE_MS) {
      lastSpeakFlushRef.current = now;
      flushSpeakingUids();
      return;
    }
    if (speakFlushTimerRef.current) return;
    speakFlushTimerRef.current = setTimeout(() => {
      speakFlushTimerRef.current = null;
      lastSpeakFlushRef.current = Date.now();
      flushSpeakingUids();
    }, SPEAK_THROTTLE_MS - elapsed);
  }, [flushSpeakingUids]);

  const isLocalRtcUid = useCallback((rawUid: number) => {
    return (
      rawUid === 0 ||
      (localUidRef.current > 0 && rawUid === localUidRef.current)
    );
  }, []);

  const speakingUidsForRaw = useCallback(
    (rawUid: number): number[] => {
      if (isLocalRtcUid(rawUid)) {
        const ids = [0];
        if (localUidRef.current > 0) ids.push(localUidRef.current);
        return ids;
      }
      if (!Number.isFinite(rawUid) || rawUid < 0) return [];
      return [rawUid];
    },
    [isLocalRtcUid],
  );

  const applySpeakingUid = useCallback(
    (uid: number, active: boolean) => {
      if (!Number.isFinite(uid) || uid < 0) return;

      let entry = speakingEntriesRef.current.get(uid);
      if (!entry) {
        entry = { active: false };
        speakingEntriesRef.current.set(uid, entry);
      }
      if (entry.clearTimer) {
        clearTimeout(entry.clearTimer);
        entry.clearTimer = undefined;
      }
      if (active) {
        entry.active = true;
        return;
      }
      entry.clearTimer = setTimeout(() => {
        entry!.active = false;
        entry!.clearTimer = undefined;
        scheduleSpeakingFlush();
      }, SPEAK_HOLD_MS);
    },
    [scheduleSpeakingFlush],
  );

  const updateSpeakingUid = useCallback(
    (rawUid: number, active: boolean) => {
      const uids = speakingUidsForRaw(rawUid);
      if (!uids.length) return;
      for (const uid of uids) {
        applySpeakingUid(uid, active);
      }
      scheduleSpeakingFlush();
    },
    [speakingUidsForRaw, applySpeakingUid, scheduleSpeakingFlush],
  );

  const emitRtcRegister = useCallback(
    (uid: number) => {
      if (!roomId || !uid || uid <= 0) return;
      ws.current?.emit('rtc:register', { roomId, uid });
    },
    [roomId],
  );

  // ── Agora RTC ──────────────────────────────────────────────────────────────

  // `isCurrent` is checked after every await: the token fetch (and permission
  // prompts) can outlive the session, and a join completing after teardown
  // leaves an orphaned engine playing room audio with no owner to release it.
  const connectAgora = useCallback(async (isCurrent: () => boolean = () => true) => {
    if (!enabled || IS_EXPO_GO) return;
    try {
      const {
        createAgoraRtcEngine,
        ChannelProfileType,
        ClientRoleType,
        AudioScenarioType,
      } = require('react-native-agora');

      // Request mic (and camera if video room) permissions before joining.
      if (canPublish) {
        const { status } = await requestRecordingPermissionsAsync();
        if (status !== 'granted') {
          toast.show('Microphone access is required to speak in this room.', 'error');
          return;
        }
      }
      // Android requires explicit runtime camera permission — the manifest entry alone
      // is not enough for Android 6+. Request it before publishing camera (host only).
      if (canPublish && publishVideo && Platform.OS === 'android') {
        const camGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (camGranted !== PermissionsAndroid.RESULTS.GRANTED) {
          toast.show('Camera access is required for live video.', 'error');
          return;
        }
      }

      if (!isCurrent()) return;

      const tokenResult = await roomsApi.getToken(
        roomId,
        canPublish ? 'publisher' : 'subscriber',
      );
      if (!tokenResult.token || !tokenResult.appId) return;
      if (!isCurrent()) return;

      const engine = createAgoraRtcEngine();
      engineRef.current = engine;

      engine.initialize({
        appId: tokenResult.appId,
        channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
      });

      // Improves iOS/Android background audio behavior for live rooms (with UIBackgroundModes audio on iOS).
      engine.setAudioScenario(AudioScenarioType.AudioScenarioGameStreaming);

      engine.registerEventHandler({
        onJoinChannelSuccess: (connection: any) => {
          const joinedUid = connection.localUid ?? tokenResult.uid;
          localUidRef.current = joinedUid;
          setAgoraJoined(true);
          setLocalUid(joinedUid);
          try {
            engine.enableAudioVolumeIndication(200, 3, true);
          } catch (e) {
            console.warn('[Agora] enableAudioVolumeIndication', e);
          }
          emitRtcRegister(joinedUid);
        },
        onAudioVolumeIndication: (
          _connection: unknown,
          speakers: Array<{ uid?: number; volume?: number; vad?: number }>,
        ) => {
          if (!speakers?.length) return;
          for (const speaker of speakers) {
            updateSpeakingUid(speaker.uid ?? 0, isVolumeSpeakerActive(speaker));
          }
          scheduleSpeakingFlush();
        },
        onUserJoined: (_connection: any, remoteUid: number) => {
          setRemoteUids((prev) => [...prev.filter((u) => u !== remoteUid), remoteUid]);
        },
        onUserOffline: (_connection: any, remoteUid: number) => {
          setRemoteUids((prev) => prev.filter((u) => u !== remoteUid));
          const entry = speakingEntriesRef.current.get(remoteUid);
          if (entry?.clearTimer) clearTimeout(entry.clearTimer);
          speakingEntriesRef.current.delete(remoteUid);
          scheduleSpeakingFlush();
        },
        onLeaveChannel: () => {
          setAgoraJoined(false);
          setRemoteUids([]);
          clearSpeakingState();
        },
        onError: (err: number, msg: string) => {
          logDiagnostic('agora', 'engine_error', { code: err, msg });
          console.warn('[Agora] error', err, msg);
        },
      });

      if (subscribeVideo) {
        engine.enableVideo();
      }

      if (canPublish) {
        engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
        engine.enableAudio();
        if (publishVideo) {
          engine.enableVideo();
          // cameraDirection: 1 = front camera, 0 = back camera
          engine.setCameraCapturerConfiguration({ cameraDirection: 1 });
          engine.startPreview();
        }
      } else {
        engine.setClientRole(ClientRoleType.ClientRoleAudience);
        engine.enableAudio();
      }

      await engine.joinChannel(tokenResult.token, tokenResult.channel, tokenResult.uid, {
        clientRoleType: canPublish
          ? ClientRoleType.ClientRoleBroadcaster
          : ClientRoleType.ClientRoleAudience,
        publishMicrophoneTrack:  canPublish,
        publishCameraTrack:      canPublish && publishVideo,
        autoSubscribeAudio:      true,
        autoSubscribeVideo:      subscribeVideo,
      });

      if (!isCurrent()) {
        // Superseded mid-join. If a concurrent disconnect already claimed the
        // ref it owns the teardown; otherwise release the engine ourselves.
        if (engineRef.current === engine) {
          engineRef.current = null;
          try {
            await engine.leaveChannel();
            engine.unregisterEventHandler({});
            engine.release();
          } catch {
            /* ignore */
          }
        }
        return;
      }

      if (canPublish) {
        setMicEnabled(true);
        if (publishVideo) setCamEnabled(true);
      }
      // Sync the role-switch guard so it doesn't fire spuriously on the first join.
      prevCanPublish.current = canPublish;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logDiagnostic('agora', 'connect_failed', { roomId, message });
      console.warn('[Agora] connect failed:', err);
      // Release the engine if initialize() succeeded but a later step (joinChannel, etc.) threw.
      // Otherwise engineRef.current leaks and the next room join hits a half-initialized native engine.
      const leakedEngine = engineRef.current;
      if (leakedEngine) {
        try { leakedEngine.unregisterEventHandler?.({}); } catch {}
        try { leakedEngine.release?.(); } catch {}
        engineRef.current = null;
        setAgoraJoined(false);
      }
      toast.show('Could not connect to the room audio. Please try again.', 'error');
    }
  }, [
    roomId,
    canPublish,
    enabled,
    publishVideo,
    subscribeVideo,
    toast,
    emitRtcRegister,
    updateSpeakingUid,
    scheduleSpeakingFlush,
    clearSpeakingState,
  ]);

  const disconnectAgora = useCallback(async () => {
    // Claim the engine synchronously: a connect overlapping this teardown must
    // never have its freshly-created engine ref nulled out after our awaits
    // (that leaks a joined engine that keeps playing room audio forever).
    const engine = engineRef.current;
    engineRef.current = null;
    if (!engine) return;
    try {
      engine.enableAudioVolumeIndication(0, 3, false);
    } catch {
      /* ignore */
    }
    try {
      await engine.leaveChannel();
      engine.unregisterEventHandler({});
      engine.release();
    } catch (err) {
      console.warn('[Agora] disconnect error:', err);
    }
    setAgoraJoined(false);
    setMicEnabled(false);
    setCamEnabled(false);
    localUidRef.current = 0;
    setLocalUid(0);
    setRemoteUids([]);
    clearSpeakingState();
  }, [clearSpeakingState]);

  const toggleMic = useCallback(() => {
    if (seatMutedByHost) {
      toast.show("The host has muted your microphone.", "info");
      return;
    }
    setMicEnabled((v) => !v);
  }, [seatMutedByHost, toast]);

  // Single place for publisher audio mute: self toggle + host seat mute.
  useEffect(() => {
    if (IS_EXPO_GO || !engineRef.current || !agoraJoined || !canPublish) return;
    const publishing = micEnabled && !seatMutedByHost;
    try {
      engineRef.current.muteLocalAudioStream(!publishing);
    } catch (e) {
      console.warn("[Agora] sync local audio mute", e);
    }
  }, [micEnabled, seatMutedByHost, agoraJoined, canPublish]);

  const toggleCam = useCallback(async () => {
    const next = !camEnabled;
    setCamEnabled(next);
    if (IS_EXPO_GO || !engineRef.current) return;
    try {
      if (next) {
        engineRef.current.enableVideo();
        engineRef.current.startPreview();
        engineRef.current.muteLocalVideoStream(false);
      } else {
        engineRef.current.muteLocalVideoStream(true);
        engineRef.current.stopPreview();
      }
    } catch (e) {
      console.warn('[Agora] toggleCam error:', e);
    }
  }, [camEnabled]);

  // ── Socket.io ──────────────────────────────────────────────────────────────

  const handleRoomJoinAck = useCallback((ack: any) => {
    if (ack?.error) {
      onWsRef.current?.({
        event: 'room:join:error',
        data: {
          error: ack.error,
          isLocked: ack?.isLocked,
          kicked: ack?.kicked,
          cooldownMinutes: ack?.cooldownMinutes,
          expiresAt: ack?.expiresAt,
        },
      });
      console.warn('[Socket.io] join error:', ack.error);
      return;
    }
    if (Array.isArray(ack?.viewers)) {
      onWsRef.current?.({
        event: 'room.roster',
        data: { viewers: ack.viewers, count: ack.viewerCount ?? ack.viewers.length },
      });
    }
    if (Array.isArray(ack?.applicants)) {
      onWsRef.current?.({ event: 'seat.application.snapshot', data: { applicants: ack.applicants } });
    }
    // Full mic occupancy at join time — reconciles existing seated users even when
    // the HTTP room snapshot was stale (missed someone who sat down just before we entered).
    if (Array.isArray(ack?.seats)) {
      onWsRef.current?.({ event: 'seats.snapshot', data: { seats: ack.seats } });
    }
    onWsRef.current?.({ event: 'room:theme:init', data: { activeTheme: ack?.activeTheme ?? null } });
    if (ack?.restoredHostSeat) {
      onWsRef.current?.({ event: 'seat.updated', data: ack.restoredHostSeat });
    }
    if (ack?.rtcUids && typeof ack.rtcUids === 'object') {
      onWsRef.current?.({
        event: 'rtc.uids.snapshot',
        data: { rtcUids: ack.rtcUids as Record<string, number> },
      });
    }
  }, []);

  const emitRoomJoin = useCallback(() => {
    const socket = ws.current;
    if (!socket?.connected || !enabled || !roomId) return;
    const joinPayload: Record<string, unknown> = { roomId };
    const password = roomPasswordRef.current;
    if (password) joinPayload.password = password;
    socket.emit('room:join', joinPayload, handleRoomJoinAck);
  }, [roomId, enabled, handleRoomJoinAck]);

  const connectWs = useCallback(async () => {
    if (!enabled) return;
    const token = await getFreshSocketToken();
    if (!token) return;

    const baseUrl = getSocketBaseUrl();

    const socket = ioClient(baseUrl, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // No attempt cap: Agora publishes independently for hours (24h RTC token),
      // so a socket that gives up leaves a ghost publisher — seat cleared
      // server-side after debounce (8s, aligned with reconnectionDelayMax), voice
      // still audible, and no rejoin ever reconciles it. Infinite retries guarantee
      // the seats.snapshot resync on recovery.
    });
    ws.current = socket;

    // One re-auth per connect cycle: a successful connect re-arms it.
    let reauthAttempted = false;

    socket.on('connect', () => {
      reauthAttempted = false;
      setWsConnected(true);
      emitRoomJoin();
    });

    socket.on('disconnect', () => setWsConnected(false));
    socket.on('connect_error', (err) => {
      logDiagnostic('socket', 'connect_error', { roomId, message: err.message });
      console.warn('[Socket.io] connect_error:', err.message);
      // Auto-reconnect reuses the handshake's static auth token, so an expired
      // token fails every retry identically. Rotate it once and reconnect.
      const isAuthError = /token|authentication/i.test(err.message);
      if (!isAuthError || reauthAttempted) return;
      reauthAttempted = true;
      void getFreshSocketToken(true).then((fresh) => {
        if (!fresh || ws.current !== socket) return;
        socket.auth = { token: fresh };
        if (!socket.connected) socket.connect();
      });
    });

    const events = [
      'user.joined', 'user.left', 'seat.updated',
      'message.sent',
      'room.ended', 'listener.count', 'room.roster', 'gift:received', 'lucky.reward',
      'emoji.received',
      'seat.application.added', 'seat.application.removed', 'seat.application.resolved',
      'room:kicked', 'room.configUpdated', 'room:theme_changed',
      'calculator:started', 'calculator:score_update', 'calculator:ended',
      'chat:cleared', 'music:changed', 'music:stopped', 'music:queue:updated', 'mic:hd_changed',
      'rtc.uid',
    ];
    for (const event of events) {
      socket.on(event, (data: any) => onWsRef.current?.({ event, data }));
    }

    // Mic invite — forward to RoomScreen when user is in-room; global modal otherwise.
    socket.on('seat.invitation', (data: SeatInvitationPayload) => {
      const normalized = normalizeSeatInvitationPayload(data);
      if (normalized) onWsRef.current?.({ event: 'seat.invitation', data: normalized });
    });
  }, [enabled, emitRoomJoin]);

  const disconnectWs = useCallback((opts?: { explicitLeave?: boolean }) => {
    if (ws.current) {
      if (opts?.explicitLeave) {
        try { ws.current.emit('room:leave', { roomId }); } catch {}
      }
      // Drop every handler before disconnect so any in-flight events from the
      // server don't fire callbacks that close over stale React state.
      try { ws.current.removeAllListeners(); } catch {}
      try { ws.current.disconnect(); } catch {}
      ws.current = null;
    }
    setWsConnected(false);
  }, [roomId]);

  // Seat application flow — resolves to `{ ok, approved?, queued?, seatPosition? } | { error }`.
  const applyForSeat = useCallback(
    (position: number | null) =>
      new Promise<any>((resolve) =>
        ws.current?.emit('seat:apply', { roomId, position }, resolve),
      ),
    [roomId],
  );
  const cancelSeatApplication = useCallback(
    () => ws.current?.emit('seat:cancel-apply', { roomId }),
    [roomId],
  );
  const approveSeatApplicant = useCallback(
    (applicantUserId: string) =>
      new Promise<any>((resolve) =>
        ws.current?.emit('seat:approve', { roomId, applicantUserId }, resolve),
      ),
    [roomId],
  );
  const sendMessage = useCallback(
    (content: string) => ws.current?.emit('chat:message', { roomId, content }),
    [roomId],
  );
  const sendEmoji = useCallback(
    (seatPosition: number, emojiKey: string) =>
      ws.current?.emit('room:emoji', { roomId, seatPosition, emojiKey }),
    [roomId],
  );
  const muteSeat = useCallback(
    (position: number, mute: boolean) =>
      new Promise<any>((resolve) =>
        ws.current?.emit('seat:mute', { roomId, position, mute }, resolve),
      ),
    [roomId],
  );

  // ── Agora role promotion / demotion when canPublish changes ──────────────
  // When a user takes or leaves a seat, canPublish flips. We must:
  //   1. Fetch a new token with the correct role (publisher/subscriber)
  //      — Agora rejects publishing on a subscriber token even after
  //        setClientRole(Broadcaster).
  //   2. Renew the token on the engine.
  //   3. Switch the client role so the SDK enables/disables publishing.
  const prevCanPublish = useRef(canPublish);
  useEffect(() => {
    if (!agoraJoined || IS_EXPO_GO || !engineRef.current) return;
    if (canPublish === prevCanPublish.current) return;

    // Session teardown (stopSession) clears roomId before Agora disconnect finishes.
    // Avoid subscriber token fetch with empty roomId — causes 404 and a misleading toast.
    if (!roomId || !enabled) {
      prevCanPublish.current = canPublish;
      return;
    }

    prevCanPublish.current = canPublish;

    const engine = engineRef.current;

    const switchRole = async () => {
      try {
        const { ClientRoleType } = require('react-native-agora');

        // Request mic (and camera) permission when taking a seat (may be first-time prompt)
        if (canPublish) {
          const { status } = await requestRecordingPermissionsAsync();
          if (status !== 'granted') {
            toast.show('Microphone access is required to speak in this room.', 'error');
            return;
          }
        }
        if (canPublish && publishVideo && Platform.OS === 'android') {
          const camGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
          if (camGranted !== PermissionsAndroid.RESULTS.GRANTED) {
            toast.show('Camera access is required for live video.', 'error');
            return;
          }
        }

        // Fetch a fresh token matching the new role — subscriber tokens reject
        // publishing even after setClientRole(Broadcaster), so this is required.
        const newToken = await roomsApi.getToken(
          roomId,
          canPublish ? 'publisher' : 'subscriber',
        );
        if (!newToken.token) {
          throw new Error('Empty token received');
        }
        engine.renewToken(newToken.token);
        if (newToken.uid > 0) {
          localUidRef.current = newToken.uid;
          setLocalUid(newToken.uid);
          emitRtcRegister(newToken.uid);
        }

        if (canPublish) {
          // Promote: audience → broadcaster
          // updateChannelMediaOptions is required in Agora SDK 4.x to actually
          // enable publishMicrophoneTrack after the initial join had it false.
          // setClientRole alone does NOT flip the track publish flag.
          engine.updateChannelMediaOptions({
            clientRoleType: ClientRoleType.ClientRoleBroadcaster,
            publishMicrophoneTrack: true,
            publishCameraTrack: publishVideo,
            autoSubscribeVideo: subscribeVideo,
          });
          engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
          engine.muteLocalAudioStream(false);
          setMicEnabled(true);
          if (publishVideo) {
            engine.enableVideo();
            engine.setCameraCapturerConfiguration({ cameraDirection: 1 });
            engine.muteLocalVideoStream(false);
            engine.startPreview();
            setCamEnabled(true);
          }
        } else {
          // Demote: broadcaster → audience (keep watching host video in live rooms)
          engine.muteLocalAudioStream(true);
          setMicEnabled(false);
          if (publishVideo) {
            engine.muteLocalVideoStream(true);
            engine.stopPreview();
            setCamEnabled(false);
          }
          engine.updateChannelMediaOptions({
            clientRoleType: ClientRoleType.ClientRoleAudience,
            publishMicrophoneTrack: false,
            publishCameraTrack: false,
            autoSubscribeVideo: subscribeVideo,
          });
          engine.setClientRole(ClientRoleType.ClientRoleAudience);
        }
      } catch (err) {
        console.warn('[Agora] role switch error:', err);
        // Revert mic/cam UI state so it matches the actual (unchanged) Agora state
        setMicEnabled(!canPublish ? false : micEnabled);
        if (publishVideo) setCamEnabled(!canPublish ? false : camEnabled);
        toast.show(
          canPublish
            ? 'Could not activate your microphone. Please try again.'
            : 'Could not release the seat audio. Please try again.',
          'error',
        );
      }
    };

    switchRole();
  // micEnabled/camEnabled intentionally read as rollback values, not trigger deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublish, agoraJoined, enabled, publishVideo, subscribeVideo, roomId, toast, emitRtcRegister]);

  /** True when Agora reports the local publisher is speaking (uid 0 or localUid). */
  const localSpeaking = useMemo(() => {
    if (activeSpeakerRtcUids.has(0)) return true;
    if (localUid > 0 && activeSpeakerRtcUids.has(localUid)) return true;
    return false;
  }, [activeSpeakerRtcUids, localUid]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  // Reconnect when room switches or live/video subscription flags change (e.g. roomMode from API).
  useEffect(() => {
    if (!enabled) return;
    agoraGenRef.current += 1;
    const gen = agoraGenRef.current;
    const isCurrent = () => gen === agoraGenRef.current;
    void (async () => {
      await agoraTeardownRef.current;
      if (!isCurrent()) return;
      await connectAgora(isCurrent);
    })();
    return () => {
      agoraGenRef.current += 1;
      agoraTeardownRef.current = disconnectAgora();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, publishVideo, subscribeVideo]);

  // WebSocket lifecycle — reconnect when room switches or realtime is disabled/enabled.
  useEffect(() => {
    if (!enabled) return;
    connectWs();
    // Intentional exit uses disconnectWs({ explicitLeave: true }) from stopSession.
    // Effect teardown only drops the socket; server debounces full leave so brief
    // reconnects (same room / password rotation) do not clear mic seats immediately.
    return () => disconnectWs();
  }, [enabled, roomId, connectWs, disconnectWs]);

  // Password supplied after lock gate — re-join on the existing socket (no full reconnect).
  useEffect(() => {
    if (!enabled || !roomPasswordRef.current) return;
    emitRoomJoin();
  }, [enabled, roomPassword, emitRoomJoin]);

  // Re-join when returning from Keep (socket still connected; connect handler does not re-fire).
  useEffect(() => {
    if (!enabled || rejoinGeneration <= 0) return;
    emitRoomJoin();
  }, [enabled, rejoinGeneration, emitRoomJoin]);

  return {
    micEnabled,
    camEnabled,
    toggleMic,
    toggleCam,
    agoraJoined,
    lkConnected: agoraJoined,  // backwards compat alias
    wsConnected,
    applyForSeat,
    cancelSeatApplication,
    approveSeatApplicant,
    sendMessage,
    sendEmoji,
    muteSeat,
    localUid,
    remoteUids,
    activeSpeakerRtcUids,
    localSpeaking,
    engine: engineRef.current,
    isExpoGo: IS_EXPO_GO,
    ws: ws.current,
    disconnectWs,
  };
}
