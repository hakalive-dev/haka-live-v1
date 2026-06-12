import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { chatApi } from '@api/chat';
import { useLoopingCallSound } from '@hooks/useCallSound';
import { cancelIncomingCallNotification } from '@/services/callNotifications';
import { Colors, Spacing } from '@/theme';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'IncomingCall'>;

const VIBRATION_PATTERN = [0, 900, 1100];
/** Backend marks the call missed at 40s; this is a local fallback if that signal never lands. */
const LOCAL_RING_TIMEOUT_MS = 50_000;

export function IncomingCallScreen({ route, navigation }: Props) {
  const {
    callerId,
    callerDisplayName,
    callId,
    channelId,
    agoraToken,
    appId,
    uid,
    autoAnswer,
  } = route.params;
  const insets = useSafeAreaInsets();

  const [answering, setAnswering] = useState(false);
  const settledRef = useRef(false);

  useLoopingCallSound('ringtone', !answering);

  useEffect(() => {
    Vibration.vibrate(VIBRATION_PATTERN, true);
    return () => Vibration.cancel();
  }, []);

  // The in-app UI supersedes any ringing notification for this call.
  useEffect(() => {
    void cancelIncomingCallNotification(callId);
  }, [callId]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!settledRef.current && navigation.canGoBack()) navigation.goBack();
    }, LOCAL_RING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [navigation]);

  const handleAnswer = useCallback(async () => {
    if (settledRef.current) return;
    settledRef.current = true;
    setAnswering(true);
    Vibration.cancel();
    let answered = false;
    try {
      await chatApi.postCallAnswer(callerId);
      answered = true;
      let call = { channelId, agoraToken, appId, uid };
      if (!call.channelId || !call.agoraToken || !call.appId || call.uid == null) {
        const t = await chatApi.getCallToken(callerId);
        call = { channelId: t.channel, agoraToken: t.token, appId: t.appId, uid: t.uid };
      }
      navigation.replace('VideoCall', {
        userId: callerId,
        displayName: callerDisplayName,
        channelId: call.channelId!,
        agoraToken: call.agoraToken!,
        appId: call.appId!,
        uid: call.uid!,
        incoming: true,
      });
    } catch {
      if (answered) {
        // Answered server-side but couldn't join — end the call so the row
        // doesn't linger as 'answered' and the caller stops ringing.
        void chatApi.postCallEnd(callerId).catch(() => {});
      }
      // Otherwise most likely 410: the caller hung up / the call timed out.
      Alert.alert('Video call', 'This call has already ended.');
      if (navigation.canGoBack()) navigation.goBack();
    }
  }, [callerId, callerDisplayName, channelId, agoraToken, appId, uid, navigation]);

  const handleDecline = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    void chatApi.postCallDecline(callerId).catch(() => {});
    if (navigation.canGoBack()) navigation.goBack();
  }, [callerId, navigation]);

  useEffect(() => {
    if (autoAnswer) void handleAnswer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.xxl }]}>
        <Text style={styles.incomingLabel}>Incoming video call</Text>
      </View>

      <View style={styles.callerWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>
            {callerDisplayName[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.callerName}>{callerDisplayName}</Text>
        <Text style={styles.subtitle}>
          {answering ? 'Connecting…' : 'is calling you'}
        </Text>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.xxl }]}>
        <View style={styles.actionCol}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.declineBtn]}
            onPress={handleDecline}
            disabled={answering}
          >
            <Ionicons
              name="call"
              size={30}
              color="#FFF"
              style={{ transform: [{ rotate: '135deg' }] }}
            />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Decline</Text>
        </View>

        <View style={styles.actionCol}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.answerBtn, answering && styles.btnDisabled]}
            onPress={handleAnswer}
            disabled={answering}
          >
            <Ionicons name="videocam" size={30} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Answer</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#101018',
  },
  header: {
    alignItems: 'center',
  },
  incomingLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  callerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primarySubtle,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFF',
  },
  callerName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFF',
    marginTop: Spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
  },
  actionCol: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtn: {
    backgroundColor: Colors.danger,
  },
  answerBtn: {
    backgroundColor: Colors.success,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  actionLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
});
