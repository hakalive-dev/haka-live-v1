import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  PermissionsAndroid,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { requestRecordingPermissionsAsync } from 'expo-audio';

import { chatApi } from '@api/chat';
import { useLoopingCallSound } from '@hooks/useCallSound';
import { Colors, Radius, Spacing } from '@/theme';
import type { RootStackScreenProps } from '@navigation/types';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

type Props = RootStackScreenProps<'VideoCall'>;

// ── Agora video view (safe dynamic require) ─────────────────────────────────

function AgoraView({ uid, style }: { uid: number; style?: any }) {
  try {
    const { RtcSurfaceView, VideoSourceType } = require('react-native-agora');
    return (
      <RtcSurfaceView
        style={style ?? StyleSheet.absoluteFill}
        canvas={{
          uid,
          sourceType: uid === 0
            ? VideoSourceType.VideoSourceCamera
            : VideoSourceType.VideoSourceRemote,
        }}
      />
    );
  } catch {
    return null;
  }
}

// ── Timer helper ─────────────────────────────────────────────────────────────

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Main screen ──────────────────────────────────────────────────────────────

export function VideoCallScreen({ route, navigation }: Props) {
  const {
    userId,
    displayName,
    channelId,
    agoraToken,
    appId,
    uid,
    incoming,
    callType = 'video',
  } = route.params;
  const insets = useSafeAreaInsets();
  const isVoiceCall = callType === 'voice';

  const [connected, setConnected]     = useState(false);
  const [micEnabled, setMicEnabled]   = useState(true);
  const [camEnabled, setCamEnabled]   = useState(!isVoiceCall);
  const [speakerOn, setSpeakerOn]     = useState(true);
  const [remoteUid, setRemoteUid]     = useState<number | null>(null);
  const [duration, setDuration]       = useState(0);
  const [connecting, setConnecting]   = useState(true);

  const engineRef    = useRef<any>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteUidRef = useRef<number | null>(null);
  const endSignalSentRef = useRef(false);
  const fadeAnim     = useRef(new Animated.Value(0)).current;

  remoteUidRef.current = remoteUid;

  // Caller hears ringback until the callee's stream arrives.
  useLoopingCallSound('ringback', !incoming && connected && remoteUid == null);

  // ── Connect Agora ──────────────────────────────────────────────────────────

  const connectAgora = useCallback(async () => {
    if (IS_EXPO_GO || !appId || !agoraToken) {
      // Expo Go or missing config — show UI without actual RTC
      setTimeout(() => setConnecting(false), 1500);
      return;
    }
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Microphone required',
          `Allow microphone access to use ${isVoiceCall ? 'voice' : 'video'} calls.`,
        );
        setConnecting(false);
        return;
      }
      if (!isVoiceCall && Platform.OS === 'android') {
        const camGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
        );
        if (camGranted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Camera required',
            'Allow camera access to use video calls.',
          );
          setConnecting(false);
          return;
        }
      }

      const {
        createAgoraRtcEngine,
        ChannelProfileType,
        ClientRoleType,
      } = require('react-native-agora');

      const engine = createAgoraRtcEngine();
      engineRef.current = engine;

      engine.initialize({
        appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      engine.registerEventHandler({
        onJoinChannelSuccess: () => {
          setConnected(true);
          setConnecting(false);
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        },
        onUserJoined: (_conn: any, rUid: number) => {
          setRemoteUid(rUid);
        },
        onUserOffline: () => {
          setRemoteUid(null);
        },
        onLeaveChannel: () => {
          setConnected(false);
          setRemoteUid(null);
        },
        onError: (err: number, msg: string) => {
          console.warn('[VideoCall] Agora error', err, msg);
          setConnecting(false);
        },
        onTokenPrivilegeWillExpire: () => {
          // Long calls outlive the token TTL — mint a fresh one for the same channel.
          void chatApi
            .getCallToken(userId)
            .then((t) => engineRef.current?.renewToken(t.token))
            .catch(() => {});
        },
      });

      engine.enableAudio();
      if (!isVoiceCall) {
        engine.enableVideo();
        engine.startPreview();
      }

      await engine.joinChannel(agoraToken, channelId, uid, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        publishMicrophoneTrack: true,
        publishCameraTrack: !isVoiceCall,
        autoSubscribeAudio: true,
        autoSubscribeVideo: !isVoiceCall,
      });
      engine.setEnableSpeakerphone(true);
    } catch (err) {
      console.warn('[VideoCall] connect failed:', err);
      setConnecting(false);
    }
  }, [appId, agoraToken, channelId, isVoiceCall, uid, fadeAnim]);

  const disconnectAgora = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.stopPreview();
      await engine.leaveChannel();
      engine.unregisterEventHandler({});
      engine.release();
    } catch {}
    engineRef.current = null;
  }, []);

  const sendEndSignal = useCallback(() => {
    if (endSignalSentRef.current) return;
    endSignalSentRef.current = true;
    // Cancel while still ringing produces a "missed call" log; the backend also
    // settles answered rows from either endpoint, so a race with answer is safe.
    if (remoteUidRef.current != null) {
      void chatApi.postCallEnd(userId).catch(() => {});
    } else {
      void chatApi.postCallCancel(userId).catch(() => {});
    }
  }, [userId]);

  useEffect(() => {
    connectAgora();
    return () => {
      // Covers every way off this screen (back gesture, remote-end navigation, …);
      // the peer's signal paths are idempotent server-side.
      sendEndSignal();
      disconnectAgora();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Call duration timer — starts when remote user joins
  useEffect(() => {
    if (!remoteUid) return;
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [remoteUid]);

  // ── Controls ───────────────────────────────────────────────────────────────

  const handleEndCall = useCallback(async () => {
    sendEndSignal();
    await disconnectAgora();
    navigation.goBack();
  }, [sendEndSignal, disconnectAgora, navigation]);

  const handleToggleMic = useCallback(() => {
    const next = !micEnabled;
    setMicEnabled(next);
    if (!IS_EXPO_GO && engineRef.current) {
      engineRef.current.muteLocalAudioStream(!next);
    }
  }, [micEnabled]);

  const handleToggleCam = useCallback(() => {
    const next = !camEnabled;
    setCamEnabled(next);
    if (!IS_EXPO_GO && engineRef.current) {
      if (next) {
        engineRef.current.enableVideo();
        engineRef.current.startPreview();
        engineRef.current.muteLocalVideoStream(false);
      } else {
        engineRef.current.muteLocalVideoStream(true);
        engineRef.current.stopPreview();
      }
    }
  }, [camEnabled]);

  const handleFlipCamera = useCallback(() => {
    if (!IS_EXPO_GO && engineRef.current) {
      engineRef.current.switchCamera();
    }
  }, []);

  const handleToggleSpeaker = useCallback(() => {
    const next = !speakerOn;
    setSpeakerOn(next);
    if (!IS_EXPO_GO && engineRef.current) {
      engineRef.current.setEnableSpeakerphone(next);
    }
  }, [speakerOn]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      {/* Remote video — fullscreen background (video calls only) */}
      {!isVoiceCall && !IS_EXPO_GO && remoteUid ? (
        <AgoraView uid={remoteUid} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={isVoiceCall ? styles.voiceBackground : styles.noVideoBackground} />
      )}

      {/* Overlay gradient */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.topGradient} />
        <View style={styles.bottomGradient} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.callerInfo}>
          <View style={styles.callerAvatarWrap}>
            <Text style={styles.callerInitial}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <View>
            <Text style={styles.callerName}>{displayName}</Text>
            <Text style={styles.callStatus}>
              {connecting
                ? 'Connecting…'
                : remoteUid
                ? formatDuration(duration)
                : incoming
                ? 'Connecting…'
                : 'Ringing…'}
            </Text>
          </View>
        </View>
        
      </View>

      {/* Local preview (picture-in-picture) */}
      {!isVoiceCall && !IS_EXPO_GO && camEnabled && (
        <View style={[styles.localPip, { top: insets.top + 80 }]}>
          <AgoraView uid={0} style={StyleSheet.absoluteFill} />
        </View>
      )}

      {/* Avatar placeholder for voice calls or before remote video connects */}
      {(isVoiceCall || !remoteUid || IS_EXPO_GO) && !connecting && (
        <View style={styles.noRemoteWrap}>
          <View style={styles.noRemoteAvatar}>
            <Text style={styles.noRemoteInitial}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <Text style={styles.noRemoteText}>
            {remoteUid ? displayName : incoming ? 'Connecting…' : 'Ringing…'}
          </Text>
        </View>
      )}

      {/* Control bar */}
      <View style={[styles.controlBar, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <TouchableOpacity
          style={[styles.ctrlBtn, !micEnabled && styles.ctrlBtnOff]}
          onPress={handleToggleMic}
        >
          <Ionicons name={micEnabled ? 'mic' : 'mic-off'} size={22} color="#FFF" />
          <Text style={styles.ctrlLabel}>{micEnabled ? 'Mute' : 'Unmute'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, !camEnabled && styles.ctrlBtnOff]}
          onPress={handleFlipCamera}
          disabled={!camEnabled}
        >
          <Ionicons name="camera-reverse" size={22} color="#FFF" />
          <Text style={styles.ctrlLabel}>Flip</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.endBtn} onPress={handleEndCall}>
          <Ionicons name="call" size={28} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, !speakerOn && styles.ctrlBtnOff]}
          onPress={handleToggleSpeaker}
        >
          <Ionicons name={speakerOn ? 'volume-high' : 'volume-low'} size={22} color="#FFF" />
          <Text style={styles.ctrlLabel}>Speaker</Text>
        </TouchableOpacity>

        {isVoiceCall ? (
          <View style={styles.ctrlBtnPlaceholder} />
        ) : (
          <TouchableOpacity
            style={[styles.ctrlBtn, !camEnabled && styles.ctrlBtnOff]}
            onPress={handleToggleCam}
          >
            <Ionicons name={camEnabled ? 'videocam' : 'videocam-off'} size={22} color="#FFF" />
            <Text style={styles.ctrlLabel}>{camEnabled ? 'Camera' : 'No cam'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  noVideoBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5F5F7',
  },
  voiceBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface,
  },
  ctrlBtnPlaceholder: {
    width: 64,
    height: 64,
  },

  // Gradient overlays (pure Views with opacity — avoids expo-linear-gradient dep here)
  topGradient: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 160,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 200,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  callerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  callerAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primarySubtle,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callerInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  callerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  callStatus: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },

  // Local PiP
  localPip: {
    position: 'absolute',
    right: Spacing.md,
    width: 90,
    height: 130,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.primary,
  },

  // No-remote placeholder
  noRemoteWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  noRemoteAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noRemoteInitial: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFF',
  },
  noRemoteText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
  },

  // Control bar
  controlBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: Spacing.xl,
  },
  ctrlBtn: {
    alignItems: 'center',
    gap: 2,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
  },
  ctrlBtnOff: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    opacity: 0.6,
  },
  ctrlLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
