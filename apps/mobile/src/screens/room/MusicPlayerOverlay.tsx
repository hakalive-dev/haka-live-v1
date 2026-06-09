import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import type { EventSubscription } from 'expo-modules-core';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { Socket } from 'socket.io-client';
import { roomsApi } from '@api/rooms';
import type { CurrentMusicTrack } from '@/types';

const CARD_BG = 'rgba(26,21,48,0.97)';
const MOCK_CARD_BG = 'rgba(50,50,50,0.98)';
const PURPLE = '#7B4FFF';
const ICON_COLOR = 'rgba(255,255,255,0.88)';

const musicLibraryIcon = (() => {
  try {
    return require('../../../assets/room-play/music_library.png');
  } catch {
    return null;
  }
})();

const musicSkipForwardIcon = require('../../../assets/room-play/music_skip_forward.png');

const HEADER_ICON = 26;
const CONTROL_ICON = 32;
const SKIP_FORWARD_ICON = 30;

export type MusicPlayerHandle = {
  stopAudio: () => Promise<void>;
  /** Expand the player card when it was minimized. */
  expand: () => void;
};

type Props = {
  track: CurrentMusicTrack | null;
  roomId: string;
  ws: Socket | null;
  onStop: () => void;
  canControl?: boolean;
  /** When true, show overlay even before a track is loaded (Room Play music entry). */
  visible?: boolean;
  bottomOffset?: number;
  onOpenLibrary?: () => void;
  onMusicTrackChange?: (track: CurrentMusicTrack | null) => void;
  onSessionClose?: () => void;
  /** When false, load track but wait for user to press play (default true). */
  autoPlay?: boolean;
  /** When true, keep playback alive but hide the on-screen player chrome. */
  hideChrome?: boolean;
};

export const MusicPlayerOverlay = React.forwardRef<MusicPlayerHandle, Props>(
function MusicPlayerOverlay({
  track,
  roomId,
  ws,
  onStop,
  canControl = false,
  bottomOffset = 90,
  visible = false,
  onOpenLibrary,
  onMusicTrackChange,
  onSessionClose,
  autoPlay = true,
  hideChrome = false,
}: Props, ref) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const statusSubRef = useRef<EventSubscription | null>(null);
  const endedEmittedRef = useRef(false);
  /** Blocks spurious music:ended when tearing down audio for skip / track change. */
  const suppressEndedRef = useRef(false);
  const shouldAutoPlayRef = useRef(true);
  const pendingPlayRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [volume, setVolume] = useState(8);
  const [minimized, setMinimized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!canControl || !roomId) return;
    roomsApi.getMusicQueue(roomId)
      .then((q) => setIsLooping(q.loopQueue))
      .catch(() => {});
  }, [canControl, roomId, track?.trackId]);

  useEffect(() => {
    let mounted = true;

    const releaseCurrent = () => {
      suppressEndedRef.current = true;
      statusSubRef.current?.remove();
      statusSubRef.current = null;
      playerRef.current?.pause();
      playerRef.current?.remove();
      playerRef.current = null;
    };

    const load = async () => {
      releaseCurrent();
      setLoadError(null);
      setPlayerReady(false);
      setIsPlaying(false);
      if (!track?.url) return;
      shouldAutoPlayRef.current = autoPlay;
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
          shouldPlayInBackground: false,
          interruptionMode: 'doNotMix',
          shouldRouteThroughEarpiece: false,
        });
        const player = createAudioPlayer({ uri: track.url });
        if (!mounted) {
          player.remove();
          return;
        }
        player.volume = volume / 10;
        player.loop = false;
        playerRef.current = player;
        statusSubRef.current = player.addListener('playbackStatusUpdate', (status) => {
          if (!status.isLoaded) return;
          setPlayerReady(true);
          setIsPlaying(status.playing);
          const wantsPlay = shouldAutoPlayRef.current || pendingPlayRef.current;
          if (wantsPlay && !status.playing) {
            shouldAutoPlayRef.current = false;
            pendingPlayRef.current = false;
            player.play();
          }
          if (
            status.didJustFinish &&
            canControl &&
            ws &&
            !suppressEndedRef.current &&
            !endedEmittedRef.current
          ) {
            endedEmittedRef.current = true;
            ws.emit('music:ended', { roomId });
          }
          if (status.playing) {
            suppressEndedRef.current = false;
            endedEmittedRef.current = false;
          }
        });
      } catch (e: unknown) {
        if (mounted) setLoadError(e instanceof Error ? e.message : 'Playback failed');
        suppressEndedRef.current = false;
        setPlayerReady(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [track?.url, canControl, roomId, ws, autoPlay]);

  useEffect(() => {
    if (playerRef.current) playerRef.current.volume = volume / 10;
  }, [volume]);

  const stopAudio = useCallback(async () => {
    playerRef.current?.pause();
    statusSubRef.current?.remove();
    statusSubRef.current = null;
    playerRef.current?.remove();
    playerRef.current = null;
    setIsPlaying(false);
    endedEmittedRef.current = false;
    await setAudioModeAsync({ shouldPlayInBackground: false });
  }, []);

  useImperativeHandle(ref, () => ({
    stopAudio,
    expand: () => setMinimized(false),
  }), [stopAudio]);

  useEffect(() => {
    return () => {
      playerRef.current?.pause();
      statusSubRef.current?.remove();
      statusSubRef.current = null;
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player || !playerReady) {
      if (track?.url) pendingPlayRef.current = true;
      return;
    }
    if (isPlaying) {
      shouldAutoPlayRef.current = false;
      pendingPlayRef.current = false;
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, playerReady, track?.url]);

  const changeVolume = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(10, volume + delta));
    setVolume(next);
    if (playerRef.current) playerRef.current.volume = next / 10;
  }, [volume]);

  const handleStop = useCallback(() => {
    if (!canControl) return;
    statusSubRef.current?.remove();
    statusSubRef.current = null;
    playerRef.current?.pause();
    playerRef.current?.remove();
    playerRef.current = null;
    onStop();
    onSessionClose?.();
  }, [canControl, onStop, onSessionClose]);

  const handleSkip = useCallback(async (direction: 'next' | 'prev') => {
    if (!canControl) return;
    suppressEndedRef.current = true;
    endedEmittedRef.current = true;
    shouldAutoPlayRef.current = true;
    pendingPlayRef.current = false;
    setPlayerReady(false);
    try {
      const { track: next } = await roomsApi.skipMusicTrack(roomId, direction);
      if (next) {
        onMusicTrackChange?.({
          url: next.url,
          name: next.name,
          trackId: next.id,
          index: next.index,
          total: next.total,
        });
      } else {
        onMusicTrackChange?.(null);
      }
    } catch {
      suppressEndedRef.current = false;
      endedEmittedRef.current = false;
    }
  }, [canControl, roomId, onMusicTrackChange]);

  const handleNextPress = useCallback(() => {
    if (!track?.url) {
      onOpenLibrary?.();
      return;
    }
    void handleSkip('next');
  }, [track?.url, onOpenLibrary, handleSkip]);

  const handleLoopToggle = useCallback(async () => {
    if (!canControl) return;
    const next = !isLooping;
    setIsLooping(next);
    try {
      await roomsApi.setMusicLoop(roomId, next);
    } catch {
      /* ignore */
    }
  }, [canControl, isLooping, roomId]);

  if (!canControl) return null;
  if (!visible && !track) return null;
  if (hideChrome) return null;

  const hasTrack = !!track?.url;
  const trackLabel = hasTrack ? track!.name : 'no music yet';
  const counter = hasTrack ? `${track!.index + 1} / ${track!.total}` : null;

  const cardHeader = (
    <View style={styles.cardHeader}>
      <TouchableOpacity
        style={styles.headerIconBtn}
        onPress={() => setMinimized(true)}
        activeOpacity={0.7}
        accessibilityLabel="Minimize player"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={styles.minimizeIconWrap}>
          <MaterialCommunityIcons
            name="arrow-bottom-right"
            size={HEADER_ICON * 0.55}
            color="#FFFFFF"
            style={styles.keepIconTL}
          />
          <MaterialCommunityIcons
            name="arrow-top-left"
            size={HEADER_ICON * 0.55}
            color="#FFFFFF"
            style={styles.keepIconBR}
          />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.headerIconBtn}
        onPress={handleStop}
        activeOpacity={0.7}
        accessibilityLabel="Stop music"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="power" size={HEADER_ICON} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container} pointerEvents="box-none">
      {minimized ? (
        <TouchableOpacity
          style={[styles.mini, { bottom: bottomOffset }]}
          onPress={() => setMinimized(false)}
        >
          <Ionicons name="musical-note" size={14} color={PURPLE} />
          <Text style={styles.miniTitle} numberOfLines={1}>{trackLabel}</Text>
          {counter ? <Text style={styles.miniCounter}>{counter}</Text> : null}
          <TouchableOpacity
            onPress={handleStop}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="power" size={18} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </TouchableOpacity>
      ) : (
        <Pressable
          style={[styles.card, { bottom: bottomOffset }]}
          onPress={onOpenLibrary}
          disabled={!onOpenLibrary}
          accessibilityRole="button"
          accessibilityLabel="Open music library"
        >
          {cardHeader}

          <Text style={[styles.title, !hasTrack && styles.titleEmpty]} numberOfLines={1}>
            {trackLabel}
          </Text>

          {loadError ? (
            <Text style={styles.errorText} numberOfLines={2}>{loadError}</Text>
          ) : null}

          <View style={styles.controlsRow}>
            <TouchableOpacity
              onPress={() => changeVolume(-1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="volume-medium" size={CONTROL_ICON} color={ICON_COLOR} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.volumeTrack}
              onPress={() => changeVolume(volume >= 8 ? -3 : 2)}
            >
              <View style={[styles.volumeFill, { width: `${volume * 10}%` }]} />
              <View style={[styles.volumeKnob, { left: `${volume * 10}%` }]} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePlay}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              disabled={!hasTrack || (!playerReady && !loadError)}
              style={!hasTrack ? styles.controlDisabled : undefined}
            >
              {hasTrack && !playerReady && !loadError ? (
                <ActivityIndicator size={CONTROL_ICON} color={PURPLE} />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause-circle-outline' : 'play-circle-outline'}
                  size={CONTROL_ICON}
                  color={ICON_COLOR}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleNextPress}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.controlTouch}
              accessibilityLabel={hasTrack ? 'Next track' : 'Open music library'}
            >
              <Image
                source={musicSkipForwardIcon}
                style={styles.skipForwardIcon}
                contentFit="contain"
                pointerEvents="none"
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLoopToggle}
              disabled={!hasTrack}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={!hasTrack ? styles.controlDisabled : undefined}
              accessibilityLabel="Repeat queue"
            >
              <Ionicons
                name="repeat-outline"
                size={CONTROL_ICON}
                color={isLooping ? PURPLE : ICON_COLOR}
              />
            </TouchableOpacity>

            {onOpenLibrary ? (
              <TouchableOpacity
                onPress={onOpenLibrary}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Open music library"
              >
                {musicLibraryIcon ? (
                  <Image
                    source={musicLibraryIcon}
                    style={styles.libraryIcon}
                    contentFit="contain"
                  />
                ) : (
                  <Ionicons name="list-outline" size={CONTROL_ICON} color={ICON_COLOR} />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  card: {
    position: 'absolute',
    left: 4,
    right: 4,
    backgroundColor: MOCK_CARD_BG,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimizeIconWrap: {
    width: 28,
    height: 28,
  },
  titleEmpty: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
  },
  controlDisabled: {
    opacity: 0.35,
  },
  keepIconTL: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  keepIconBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 22,
  },
  errorText: {
    color: '#FF4D4D',
    fontSize: 11,
    marginBottom: 10,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  controlTouch: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipForwardIcon: {
    width: SKIP_FORWARD_ICON,
    height: SKIP_FORWARD_ICON,
    tintColor: ICON_COLOR,
  },
  libraryIcon: {
    width: CONTROL_ICON,
    height: CONTROL_ICON,
  },
  volumeTrack: {
    width: 90,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.72)',
    justifyContent: 'center',
  },
  volumeFill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: PURPLE,
  },
  volumeKnob: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 24,
    marginLeft: -8,
    backgroundColor: 'rgba(230,230,230,1)',
  },
  mini: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: CARD_BG,
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  miniCounter: {
    color: PURPLE,
    fontSize: 11,
    fontWeight: '600',
  },
});
