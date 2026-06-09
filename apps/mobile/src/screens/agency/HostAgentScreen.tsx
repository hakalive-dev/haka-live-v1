import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { agencyApi } from '@api/agency';
import { Colors, Spacing, Radius } from '@/theme';
import { UserAvatar } from '@components/UserAvatar';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'HostAgent'>;

type AgentInfo = {
  id: string; displayName: string; username: string | null;
  avatar: string; country: string; totalHosts: number;
};

type ChangeRequest = {
  id: string; type: 'leave' | 'change'; status: string; reason: string; createdAt: string;
};

export function HostAgentScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [request, setRequest] = useState<ChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'leave' | 'change'>('leave');
  const [toAgentId, setToAgentId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [agentData, requestData] = await Promise.all([
        agencyApi.getMyAgent(),
        agencyApi.getMyChangeRequest(),
      ]);
      setAgent(agentData);
      setRequest(requestData);
    } catch {
      setError('Failed to load agent info.');
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  function openModal(type: 'leave' | 'change') {
    setModalType(type);
    setToAgentId('');
    setReason('');
    setSubmitError('');
    setShowModal(true);
  }

  async function submitRequest() {
    if (modalType === 'change' && !toAgentId.trim()) {
      setSubmitError('Please enter the target agent ID.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await agencyApi.submitChangeRequest({
        type: modalType,
        toAgentId: modalType === 'change' ? toAgentId.trim() : null,
        reason: reason.trim(),
      });
      setShowModal(false);
      await fetchData();
    } catch (e: any) {
      setSubmitError(e?.response?.data?.message ?? 'Submission failed. Please try again.');
    }
    setSubmitting(false);
  }

  async function cancelRequest() {
    if (!request) return;
    Alert.alert('Cancel Request', 'Are you sure you want to cancel your pending request?', [
      { text: 'No' },
      {
        text: 'Yes, cancel it',
        style: 'destructive',
        onPress: async () => {
          try {
            await agencyApi.cancelChangeRequest(request.id);
            await fetchData();
          } catch {
            Alert.alert('Error', 'Failed to cancel request.');
          }
        },
      },
    ]);
  }

  const statusColor = (s: string) => {
    if (s === 'approved') return Colors.success;
    if (s === 'rejected') return Colors.danger;
    return '#f59e0b';
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Agent</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : !agent ? (
          <Text style={styles.muted}>You are not currently under an agent.</Text>
        ) : (
          <>
            {/* Agent card */}
            <View style={styles.agentCard}>
              <UserAvatar user={{ displayName: agent.displayName, avatar: agent.avatar }} size={56} />
              <View style={styles.agentInfo}>
                <Text style={styles.agentName}>{agent.displayName}</Text>
                {agent.username ? (
                  <Text style={styles.agentUsername}>@{agent.username}</Text>
                ) : null}
                <Text style={styles.agentMeta}>{agent.totalHosts} host{agent.totalHosts !== 1 ? 's' : ''} · {agent.country || '—'}</Text>
              </View>
            </View>

            {/* Pending request banner */}
            {request && request.status === 'pending' && (
              <View style={styles.requestBanner}>
                <Ionicons name="time-outline" size={18} color="#f59e0b" />
                <View style={styles.requestBannerText}>
                  <Text style={styles.requestBannerTitle}>
                    {request.type === 'leave' ? 'Leave request' : 'Agent change request'} pending
                  </Text>
                  <Text style={styles.requestBannerSub}>
                    Submitted {new Date(request.createdAt).toLocaleDateString()}. Awaiting admin review.
                  </Text>
                </View>
                <TouchableOpacity onPress={cancelRequest} hitSlop={8}>
                  <Text style={styles.cancelLink}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Past request result */}
            {request && request.status !== 'pending' && (
              <View style={[styles.requestBanner, { borderColor: statusColor(request.status) + '55' }]}>
                <Ionicons
                  name={request.status === 'approved' ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={statusColor(request.status)}
                />
                <Text style={[styles.requestBannerTitle, { color: statusColor(request.status) }]}>
                  Your last request was {request.status}.
                </Text>
              </View>
            )}

            {/* Actions — only if no pending request */}
            {(!request || request.status !== 'pending') && (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openModal('leave')}>
                  <Ionicons name="exit-outline" size={20} color={Colors.danger} />
                  <Text style={[styles.actionBtnText, { color: Colors.danger }]}>
                    Request to Leave Agent
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openModal('change')}>
                  <Ionicons name="swap-horizontal-outline" size={20} color={Colors.primary} />
                  <Text style={[styles.actionBtnText, { color: Colors.primary }]}>
                    Request to Change Agent
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.disclaimer}>
              All requests require admin approval. Your current agent assignment remains unchanged until approved.
            </Text>
          </>
        )}
      </ScrollView>

      {/* Request modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowModal(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>
            {modalType === 'leave' ? 'Request to Leave Agent' : 'Request Agent Change'}
          </Text>
          <Text style={styles.sheetSub}>
            {modalType === 'leave'
              ? 'Submit a request for admin review. Your agent assignment will not change until approved.'
              : 'Enter the ID of the agent you want to move to.'}
          </Text>

          {modalType === 'change' && (
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Target Agent User ID</Text>
              <TextInput
                style={styles.input}
                value={toAgentId}
                onChangeText={setToAgentId}
                placeholder="Agent's UUID"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
              />
            </View>
          )}

          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Reason (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={reason}
              onChangeText={setReason}
              placeholder="Briefly explain your reason…"
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={3}
            />
          </View>

          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={submitRequest}
            disabled={submitting}
          >
            <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit Request'}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: 12, borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },

  content: { padding: Spacing.lg, gap: 16 },

  muted:     { color: Colors.textTertiary, fontSize: 14, textAlign: 'center', marginTop: 40 },
  errorText: { color: Colors.danger, fontSize: 14, textAlign: 'center', marginTop: 40 },

  agentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg ?? 12, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  agentInfo:     { flex: 1, gap: 2 },
  agentName:     { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  agentUsername: { fontSize: 13, color: Colors.textTertiary },
  agentMeta:     { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },

  requestBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f59e0b11', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#f59e0b44',
  },
  requestBannerText:  { flex: 1, gap: 2 },
  requestBannerTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  requestBannerSub:   { fontSize: 12, color: Colors.textTertiary },
  cancelLink:         { fontSize: 12, color: Colors.danger, fontWeight: '600' },

  actions: { gap: 10, marginTop: 4 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  actionBtnText: { fontSize: 14, fontWeight: '600' },

  disclaimer: { fontSize: 12, color: Colors.textTertiary, textAlign: 'center', lineHeight: 18, marginTop: 4 },

  // Modal / sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: Spacing.lg, gap: 14,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 4 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  sheetSub:    { fontSize: 13, color: Colors.textTertiary, lineHeight: 18 },

  inputBlock: { gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: '500', color: Colors.textTertiary },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },

  submitError: { fontSize: 12, color: Colors.danger },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
