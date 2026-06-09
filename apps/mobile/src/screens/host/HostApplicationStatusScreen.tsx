import React, { useCallback, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import { hostApplicationApi } from '@api/hostApplication';
import { Colors, Radius, Spacing } from '@/theme';
import { DetailSkeleton } from '@components/Skeleton';
import type { HostApplication } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'HostApplicationStatus'>;

const STATUS_CONFIG = {
  pending: {
    icon:    'time-outline' as const,
    color:   Colors.warning,
    title:   'Under Review',
    message: 'Your application has been received and is being reviewed. This usually takes 1–3 business days.',
  },
  approved: {
    icon:    'checkmark-circle' as const,
    color:   Colors.success,
    title:   'Approved!',
    message: 'Congratulations — you are now a host! Head to the home screen and start your first live room.',
  },
  rejected: {
    icon:    'close-circle' as const,
    color:   Colors.danger,
    title:   'Not Approved',
    message: 'Your application was not approved this time. You can apply again after 30 days.',
  },
};

const PATH_LABEL: Record<string, string> = {
  self_apply_independent: 'Independent Host',
  self_apply_with_agent:  'Agent-Assisted',
  agency_invitation:      'Agency Invitation',
};

export function HostApplicationStatusScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [application, setApplication] = useState<HostApplication | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setError(false);
      hostApplicationApi.getMyStatus()
        .then(setApplication)
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }, []),
  );

  const handleAccept = useCallback(async () => {
    if (!application) return;
    setActionLoading(true);
    try {
      const updated = await hostApplicationApi.acceptInvitation(application.id);
      setApplication(updated);
    } catch {
      Alert.alert('Error', 'Failed to accept invitation. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }, [application]);


  const handleDecline = useCallback(() => {
    if (!application) return;
    Alert.alert(
      'Decline Invitation',
      'Are you sure you want to decline this invitation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const updated = await hostApplicationApi.declineInvitation(application.id);
              setApplication(updated);
            } catch {
              Alert.alert('Error', 'Failed to decline invitation. Please try again.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  }, [application]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Application Status</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorText}>Failed to load status</Text>
        </View>
      ) : !application ? (
        <NoApplication onApply={() => navigation.replace('BecomeHost')} />
      ) : (
        <ApplicationCard
          application={application}
          onApplyAgain={() => navigation.replace('BecomeHost')}
          onAccept={handleAccept}
          onDecline={handleDecline}
          actionLoading={actionLoading}
        />
      )}
    </View>
  );
}

function ApplicationCard({
  application,
  onApplyAgain,
  onAccept,
  onDecline,
  actionLoading,
}: {
  application: HostApplication;
  onApplyAgain: () => void;
  onAccept: () => void;
  onDecline: () => void;
  actionLoading: boolean;
}) {
  const isInvitation =
    application.path === 'agency_invitation' && application.status === 'pending';

  const cfg = isInvitation
    ? {
        icon:    'mail-outline' as const,
        color:   Colors.primary,
        title:   'Agency Invitation',
        message: `${application.agent?.displayName ?? 'An agent'} has invited you to become a host. Do you accept?`,
      }
    : STATUS_CONFIG[application.status];

  return (
    <View style={styles.cardWrapper}>
      {/* Status hero */}
      <View style={[styles.statusHero, { borderColor: cfg.color + '44' }]}>
        <Ionicons name={cfg.icon} size={56} color={cfg.color} />
        <Text style={[styles.statusTitle, { color: cfg.color }]}>{cfg.title}</Text>
        <Text style={styles.statusMessage}>{cfg.message}</Text>
      </View>

      {/* Details */}
      <View style={styles.detailsCard}>
        <DetailRow label="Path"    value={PATH_LABEL[application.path] ?? application.path} />
        <DetailRow label="Applied" value={new Date(application.createdAt).toLocaleDateString()} />
        {application.agent && (
          <DetailRow
            label="Agent"
            value={application.agent.displayName || application.agent.username || ''}
          />
        )}
        {application.reviewedAt && (
          <DetailRow label="Reviewed" value={new Date(application.reviewedAt).toLocaleDateString()} />
        )}
        {application.note ? (
          <DetailRow label="Note" value={application.note} />
        ) : null}
      </View>

      {/* Invitation actions */}
      {isInvitation && (
        <View style={styles.invitationActions}>
          <TouchableOpacity
            style={[styles.acceptBtn, actionLoading && styles.btnDisabled]}
            onPress={onAccept}
            disabled={actionLoading}
          >
            <Ionicons name="checkmark-circle" size={18} color="#FFF" />
            <Text style={styles.acceptBtnText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.declineBtn, actionLoading && styles.btnDisabled]}
            onPress={onDecline}
            disabled={actionLoading}
          >
            <Ionicons name="close-circle-outline" size={18} color={Colors.danger} />
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CTA for rejected (non-invitation) */}
      {application.status === 'rejected' && application.path !== 'agency_invitation' && (
        <TouchableOpacity style={styles.reapplyBtn} onPress={onApplyAgain}>
          <Text style={styles.reapplyBtnText}>Apply Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function NoApplication({ onApply }: { onApply: () => void }) {
  return (
    <View style={styles.centered}>
      <Ionicons name="document-outline" size={52} color={Colors.textTertiary} />
      <Text style={styles.noAppTitle}>No Application Yet</Text>
      <Text style={styles.noAppSub}>You haven't applied to become a host yet.</Text>
      <TouchableOpacity style={styles.applyBtn} onPress={onApply}>
        <LinearGradient
          colors={Colors.gradientPurple as [string, string]}
          style={styles.applyBtnGradient}
        >
          <Ionicons name="mic" size={18} color="#FFF" />
          <Text style={styles.applyBtnText}>Apply Now</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: Colors.background },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  errorText: { color: Colors.textSecondary, fontSize: 14 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: Colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },

  cardWrapper: { flex: 1, padding: Spacing.lg, gap: Spacing.lg },

  statusHero: {
    alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl, padding: Spacing.xl,
    borderWidth: 1,
  },
  statusTitle:   { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  statusMessage: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  detailValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },

  reapplyBtn: {
    height: 52, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  reapplyBtnText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },

  invitationActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 52,
    backgroundColor: Colors.success,
    borderRadius: Radius.lg,
  },
  acceptBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  declineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 52,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  declineBtnText: { color: Colors.danger, fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  noAppTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700', marginTop: Spacing.sm },
  noAppSub:   { color: Colors.textTertiary, fontSize: 14, textAlign: 'center' },
  applyBtn:   { marginTop: Spacing.md, borderRadius: Radius.lg, overflow: 'hidden' },
  applyBtnGradient: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
