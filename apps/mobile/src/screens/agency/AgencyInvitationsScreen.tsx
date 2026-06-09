import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Radius, Spacing } from '@/theme';
import type { RootStackScreenProps } from '@navigation/types';
import {
  agencyInvitationsApi,
  type InvitationDTO,
  type AgencySearchResult,
} from '@api/agencyInvitations';

type Props = RootStackScreenProps<'AgencyInvitations'>;
type Tab = 'Sent' | 'Received';

const TABS: Tab[] = ['Sent', 'Received'];

function statusColor(s: InvitationDTO['status']) {
  if (s === 'approved') return Colors.success;
  if (s === 'rejected') return Colors.danger;
  if (s === 'cancelled') return Colors.textTertiary;
  return Colors.warning;
}

function StatusBadge({ status }: { status: InvitationDTO['status'] }) {
  return (
    <View style={[styles.badge, { borderColor: statusColor(status) + '55', backgroundColor: statusColor(status) + '18' }]}>
      <Text style={[styles.badgeText, { color: statusColor(status) }]}>{status}</Text>
    </View>
  );
}

function InvitationRow({
  item,
  onCancel,
  cancelling,
}: {
  item: InvitationDTO;
  onCancel?: (id: string) => void;
  cancelling: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowAgency}>{item.toAgency?.name ?? item.fromAgency?.name}</Text>
        <Text style={styles.rowOwner}>{item.toAgency?.owner.displayName ?? item.fromAgency?.owner.displayName}</Text>
        <Text style={styles.rowDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <View style={styles.rowRight}>
        <StatusBadge status={item.status} />
        {onCancel && item.status === 'pending' && (
          <TouchableOpacity
            onPress={() => onCancel(item.id)}
            disabled={cancelling}
            hitSlop={8}
            style={styles.cancelBtn}
          >
            <Text style={styles.cancelBtnText}>{cancelling ? '…' : 'Cancel'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function AgencyInvitationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('Sent');
  const [sent, setSent] = useState<InvitationDTO[]>([]);
  const [received, setReceived] = useState<InvitationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Send sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AgencySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AgencySearchResult | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await agencyInvitationsApi.list();
      setSent(data.sent);
      setReceived(data.received);
    } catch {
      setError('Failed to load invitations.');
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      await agencyInvitationsApi.cancel(id);
      await fetchData();
    } catch {
      // ignore — row stays as-is
    }
    setCancellingId(null);
  }

  function openSheet() {
    setSearchQuery('');
    setSearchResults([]);
    setSelected(null);
    setNote('');
    setSendError('');
    setSheetOpen(true);
  }

  function onSearchChange(text: string) {
    setSearchQuery(text);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await agencyInvitationsApi.searchAgencies(text.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
  }

  async function handleSend() {
    if (!selected) return;
    setSending(true);
    setSendError('');
    try {
      await agencyInvitationsApi.create(selected.id, note.trim());
      setSheetOpen(false);
      setTab('Sent');
      await fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setSendError(err?.response?.data?.message ?? 'Failed to send invitation.');
    }
    setSending(false);
  }

  const listData = tab === 'Sent' ? sent : received;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Agency Invitations</Text>
        <TouchableOpacity onPress={openSheet} hitSlop={8}>
          <Ionicons name="add" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator style={styles.loader} color={Colors.primary} />
      ) : error ? (
        <View style={styles.centred}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchData} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No {tab.toLowerCase()} invitations.</Text>
          }
          renderItem={({ item }) => (
            <InvitationRow
              item={item}
              onCancel={tab === 'Sent' ? handleCancel : undefined}
              cancelling={cancellingId === item.id}
            />
          )}
        />
      )}

      {/* Send bottom sheet */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setSheetOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Send Invitation</Text>

          {/* Agency search */}
          {selected ? (
            <View style={styles.selectedPill}>
              <Text style={styles.selectedPillText}>{selected.name}</Text>
              <TouchableOpacity
                onPress={() => { setSelected(null); setSearchQuery(''); setSearchResults([]); }}
                hitSlop={8}
              >
                <Ionicons name="close" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.searchRow}>
                <Ionicons name="search-outline" size={16} color={Colors.textTertiary} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={onSearchChange}
                  placeholder="Agency name, owner name or hakaId…"
                  placeholderTextColor={Colors.textTertiary}
                  autoCapitalize="none"
                />
                {searching && <ActivityIndicator size="small" color={Colors.primary} />}
              </View>
              {searchResults.length > 0 && (
                <View style={styles.results}>
                  {searchResults.map(r => (
                    <TouchableOpacity
                      key={r.id}
                      style={styles.resultRow}
                      onPress={() => { setSelected(r); setSearchResults([]); }}
                    >
                      <Text style={styles.resultName}>{r.name}</Text>
                      <Text style={styles.resultOwner}>{r.owner.displayName} · @{r.owner.hakaId}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Note */}
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Note (optional, max 200 chars)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={note}
              onChangeText={t => setNote(t.slice(0, 200))}
              placeholder="Add a note…"
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={3}
            />
          </View>

          {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}

          <TouchableOpacity
            style={[styles.sendBtn, (!selected || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!selected || sending}
          >
            <Text style={styles.sendBtnText}>{sending ? 'Sending…' : 'Send Invitation'}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  loader: { marginTop: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    gap: Spacing.sm,
  },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.background },

  list: { padding: Spacing.lg, gap: 10 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { color: Colors.textTertiary, textAlign: 'center', fontSize: 14, marginTop: 40 },
  errorText: { color: Colors.danger, fontSize: 14, textAlign: 'center' },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retryText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  rowMain: { flex: 1, gap: 2 },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowAgency: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  rowOwner: { fontSize: 12, color: Colors.textTertiary },
  rowDate: { fontSize: 11, color: Colors.textTertiary },

  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  cancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: Colors.danger },

  // Sheet
  overlay: { flex: 1 },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    gap: 14,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },

  results: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  resultRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  resultName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  resultOwner: { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },

  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primarySubtle,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: Spacing.sm,
  },
  selectedPillText: { fontSize: 14, fontWeight: '600', color: Colors.primary, flex: 1 },

  inputBlock: { gap: 6 },
  inputLabel: { fontSize: 12, fontWeight: '500', color: Colors.textTertiary },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },

  sendError: { fontSize: 12, color: Colors.danger },
  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: Colors.background, fontSize: 15, fontWeight: '700' },
});
