import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import type { CallType } from '@haka-live/shared-types/events';

import { chatApi } from '@api/chat';
import { Colors, Radius, Spacing } from '@/theme';
import { navigationRef } from '@/navigation/navigationRef';

const RINGTONE = require('../../assets/sounds/ringtone.wav');

export type IncomingCallPayload = {
  callerId: string;
  callerDisplayName: string;
  callType: CallType;
  channelId?: string;
  agoraToken?: string;
  appId?: string;
  uid?: number;
};

interface IncomingCallContextValue {
  show: (payload: IncomingCallPayload) => void;
  dismiss: (callerId?: string) => void;
}

const IncomingCallContext = createContext<IncomingCallContextValue | null>(null);

let externalShowIncomingCall: ((payload: IncomingCallPayload) => void) | null = null;
let externalDismissIncomingCall: ((callerId?: string) => void) | null = null;

export function showIncomingCallFromExternal(payload: IncomingCallPayload) {
  externalShowIncomingCall?.(payload);
}

export function dismissIncomingCallFromExternal(callerId?: string) {
  externalDismissIncomingCall?.(callerId);
}

export function IncomingCallProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<IncomingCallPayload | null>(null);
  const seqRef = useRef(0);

  const dismiss = useCallback((callerId?: string) => {
    setState((current) => {
      if (!current) return null;
      if (callerId && current.callerId !== callerId) return current;
      return null;
    });
  }, []);

  const show = useCallback((payload: IncomingCallPayload) => {
    seqRef.current += 1;
    setState(payload);
  }, []);

  useEffect(() => {
    externalShowIncomingCall = show;
    externalDismissIncomingCall = dismiss;
    return () => {
      if (externalShowIncomingCall === show) externalShowIncomingCall = null;
      if (externalDismissIncomingCall === dismiss) externalDismissIncomingCall = null;
    };
  }, [show, dismiss]);

  const contextValue = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <IncomingCallContext.Provider value={contextValue}>
      {children}
      {state && (
        <IncomingCallModal
          key={seqRef.current}
          payload={state}
          onDismiss={() => setState(null)}
        />
      )}
    </IncomingCallContext.Provider>
  );
}

export function useIncomingCall() {
  const ctx = useContext(IncomingCallContext);
  if (!ctx) throw new Error('useIncomingCall must be used within IncomingCallProvider');
  return ctx;
}

function IncomingCallModal({
  payload,
  onDismiss,
}: {
  payload: IncomingCallPayload;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;
  const ringPlayerRef = useRef<AudioPlayer | null>(null);
  const answeringRef = useRef(false);

  const { callerId, callerDisplayName, callType } = payload;
  const isVoice = callType === 'voice';
  const modeLabel = isVoice ? 'Voice call' : 'Video call';

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    let mounted = true;
    const startRingtone = async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
          shouldPlayInBackground: false,
          interruptionMode: 'doNotMix',
          shouldRouteThroughEarpiece: false,
        });
        const player = createAudioPlayer(RINGTONE);
        if (!mounted) {
          player.remove();
          return;
        }
        player.loop = true;
        player.volume = 1;
        ringPlayerRef.current = player;
        player.play();
      } catch {
        /* ringtone is best-effort */
      }
    };
    void startRingtone();
    return () => {
      mounted = false;
      const player = ringPlayerRef.current;
      ringPlayerRef.current = null;
      if (player) {
        try {
          player.pause();
          player.remove();
        } catch {
          /* already released */
        }
      }
    };
  }, []);

  const stopAndDismiss = useCallback(() => {
    const player = ringPlayerRef.current;
    ringPlayerRef.current = null;
    if (player) {
      try {
        player.pause();
        player.remove();
      } catch {
        /* ignore */
      }
    }
    onDismiss();
  }, [onDismiss]);

  const handleDecline = useCallback(() => {
    void chatApi.postCallDecline(callerId).catch(() => {});
    stopAndDismiss();
  }, [callerId, stopAndDismiss]);

  const handleAnswer = useCallback(() => {
    if (answeringRef.current) return;
    answeringRef.current = true;
    stopAndDismiss();

    void (async () => {
      try {
        let channelId = payload.channelId;
        let agoraToken = payload.agoraToken;
        let appId = payload.appId;
        let uid = payload.uid;

        if (!channelId || !agoraToken || !appId || uid == null) {
          const t = await chatApi.getCallToken(callerId);
          channelId = t.channel;
          agoraToken = t.token;
          appId = t.appId;
          uid = t.uid;
        }

        if (!navigationRef.isReady()) return;
        navigationRef.navigate('VideoCall', {
          userId: callerId,
          displayName: callerDisplayName,
          callType,
          channelId,
          agoraToken,
          appId,
          uid,
        });
      } catch {
        /* ignore — user can retry from chat */
      }
    })();
  }, [callerDisplayName, callerId, callType, payload, stopAndDismiss]);

  const initial = callerDisplayName[0]?.toUpperCase() ?? '?';

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.content, { paddingTop: insets.top + Spacing.xxxl }]}>
          <Text style={styles.modeLabel}>{modeLabel}</Text>
          <Text style={styles.incomingLabel}>Incoming call</Text>

          <Animated.View style={[styles.avatarRing, { transform: [{ scale: pulse }] }]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          </Animated.View>

          <Text style={styles.callerName}>{callerDisplayName}</Text>
          <Text style={styles.subtitle}>is calling you…</Text>
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.xxl }]}>
          <TouchableOpacity style={styles.actionWrap} onPress={handleDecline} activeOpacity={0.85}>
            <View style={styles.declineCircle}>
              <Ionicons name="close" size={32} color={Colors.textPrimary} />
            </View>
            <Text style={styles.actionLabel}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionWrap} onPress={handleAnswer} activeOpacity={0.85}>
            <View style={styles.answerCircle}>
              <Ionicons
                name={isVoice ? 'call' : 'videocam'}
                size={30}
                color={Colors.textPrimary}
              />
            </View>
            <Text style={styles.actionLabel}>Answer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.surface,
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  incomingLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: Spacing.xxxl,
  },
  avatarRing: {
    padding: 6,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 48,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  callerName: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  actionWrap: {
    alignItems: 'center',
    gap: Spacing.sm,
    width: 88,
  },
  declineCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
