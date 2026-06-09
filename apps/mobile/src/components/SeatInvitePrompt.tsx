import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Radius, Spacing } from '@/theme';
import { roomsApi } from '../api/rooms';
import { navigationRef } from '../navigation/navigationRef';
import {
  getActiveRoomIdFromNavigation,
  navigateToRoomForSeatInvite,
} from '../navigation/roomNavigation';

const COUNTDOWN_SECONDS = 10;

export interface SeatInvitationPayload {
  roomId: string;
  roomTitle: string;
  roomCode: string | null;
  coverImage: string | null;
  roomMode?: 'live' | 'chat';
  position: number;
  fromUser: {
    id: string;
    displayName: string;
    avatar: string | null;
  } | null;
}

interface SeatInvitePromptContextValue {
  show: (payload: SeatInvitationPayload) => void;
}

const SeatInvitePromptContext = createContext<SeatInvitePromptContextValue | null>(null);

let externalShowSeatInvite: ((payload: SeatInvitationPayload) => void) | null = null;

/** Show mic-invite modal from push handlers (outside React hooks). */
export function showSeatInviteFromExternal(payload: SeatInvitationPayload) {
  externalShowSeatInvite?.(payload);
}

export function SeatInvitePromptProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SeatInvitationPayload | null>(null);
  const seqRef = useRef(0);

  const show = useCallback((payload: SeatInvitationPayload) => {
    seqRef.current += 1;
    setState(payload);
  }, []);

  useEffect(() => {
    externalShowSeatInvite = show;
    return () => {
      if (externalShowSeatInvite === show) externalShowSeatInvite = null;
    };
  }, [show]);

  const contextValue = useMemo(() => ({ show }), [show]);

  return (
    <SeatInvitePromptContext.Provider value={contextValue}>
      {children}
      {state && (
        <SeatInviteModal
          key={seqRef.current}
          payload={state}
          onDismiss={() => setState(null)}
        />
      )}
    </SeatInvitePromptContext.Provider>
  );
}

export function useSeatInvitePrompt() {
  const ctx = useContext(SeatInvitePromptContext);
  if (!ctx) throw new Error('useSeatInvitePrompt must be used inside <SeatInvitePromptProvider>');
  return ctx;
}

function SeatInviteModal({
  payload,
  onDismiss,
}: {
  payload: SeatInvitationPayload;
  onDismiss: () => void;
}) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 0.9, duration: 150, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }, [scale, opacity, onDismiss]);

  useEffect(() => {
    const iv = setInterval(() => {
      setRemaining((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (remaining === 0) dismiss();
  }, [remaining, dismiss]);

  const handleReject = useCallback(() => {
    if (busy) return;
    dismiss();
  }, [busy, dismiss]);

  const handleJoin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const activeRoomId = getActiveRoomIdFromNavigation();
    const alreadyInRoom = activeRoomId === payload.roomId;

    try {
      if (alreadyInRoom) {
        await roomsApi.joinRoom(payload.roomId).catch(() => {});
        await roomsApi.takeSeat(payload.roomId, payload.position);
      } else if (navigationRef.isReady()) {
        navigateToRoomForSeatInvite(
          payload.roomId,
          payload.position,
          payload.roomMode ?? 'chat',
        );
      }
    } catch {
      /* RoomScreen / takeSeat will surface its own errors */
    } finally {
      dismiss();
    }
  }, [busy, payload, dismiss]);

  const inviterName = payload.fromUser?.displayName ?? 'Someone';
  const avatarUri = payload.fromUser?.avatar ?? null;

  return (
    <Modal transparent animationType="none" statusBarTranslucent visible>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Animated.View style={[styles.container, { transform: [{ scale }], opacity }]}>
          <View style={styles.avatarRing}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>
                  {inviterName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.name} numberOfLines={1}>
              {inviterName}
            </Text>
            <Text style={styles.body}>Invite you to join the mic.</Text>

            <View style={styles.actions}>
              <Pressable
                style={styles.rejectBtn}
                onPress={handleReject}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Reject mic invitation"
              >
                <Text style={styles.rejectText}>Reject</Text>
              </Pressable>
              <Pressable
                style={styles.joinBtn}
                onPress={handleJoin}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Join mic, ${remaining} seconds remaining`}
              >
                <Text style={styles.joinText}>Join ({remaining}s)</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const AVATAR_SIZE = 72;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  container: {
    width: '100%',
    alignItems: 'center',
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: Colors.surfaceElevated,
    padding: 3,
    zIndex: 2,
    marginBottom: -AVATAR_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  avatar: {
    width: AVATAR_SIZE - 6,
    height: AVATAR_SIZE - 6,
    borderRadius: (AVATAR_SIZE - 6) / 2,
    backgroundColor: Colors.surfaceHighlight,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    paddingTop: AVATAR_SIZE / 2 + Spacing.md,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  body: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.md,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  joinBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
  },
  joinText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
