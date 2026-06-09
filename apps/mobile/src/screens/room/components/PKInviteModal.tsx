import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing } from '@/theme';
import { pkApi } from '@api/pk';
import type { PkInviteState } from '@hooks/usePKBattle';

interface Props {
  invite: PkInviteState | null;
  onAccepted: () => void;
  onDismiss: () => void;
}

export function PKInviteModal({ invite, onAccepted, onDismiss }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!invite) return;
    const remaining = Math.max(0, Math.floor((new Date(invite.expiresAt).getTime() - Date.now()) / 1000));
    setSecondsLeft(remaining);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(id); onDismiss(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [invite, onDismiss]);

  const handleRespond = async (accept: boolean) => {
    if (!invite || loading) return;
    setLoading(true);
    try {
      await pkApi.respondToInvite(invite.inviteId, accept);
      accept ? onAccepted() : onDismiss();
    } catch {
      onDismiss();
    } finally {
      setLoading(false);
    }
  };

  const durationLabel = invite ? `${invite.durationSecs / 60} min` : '';

  return (
    <Modal visible={!!invite} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>⚔️</Text>
          <Text style={styles.title}>PK Challenge!</Text>
          <Text style={styles.subtitle}>You've been challenged to a {durationLabel} PK battle</Text>
          <Text style={styles.timer}>Expires in {secondsLeft}s</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.declineBtn]}
              onPress={() => handleRespond(false)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.acceptBtn]}
              onPress={() => handleRespond(true)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    width: 300,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  icon: { fontSize: 40, marginBottom: Spacing.sm },
  title: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: Spacing.xs },
  subtitle: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: Spacing.sm },
  timer: { color: Colors.warning, fontSize: 12, fontWeight: '600', marginBottom: Spacing.lg },
  actions: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: Radius.lg, alignItems: 'center' },
  declineBtn: { backgroundColor: Colors.surfaceHighlight, borderWidth: 1, borderColor: Colors.danger },
  acceptBtn: { backgroundColor: Colors.primary },
  declineText: { color: Colors.danger, fontSize: 14, fontWeight: '600' },
  acceptText: { color: Colors.textInverse, fontSize: 14, fontWeight: '600' },
});
