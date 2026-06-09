import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { Image } from 'expo-image';
import { useSelector } from 'react-redux';

import { agencyApi } from '@api/agency';
import {
  AllTypeFilterBackdrop,
  AllTypeFilterDropdown,
} from '@components/AllTypeFilterDropdown';
import { Colors, Radius, Spacing } from '@/theme';
import type { AgencyHost } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '@store/index';

type Props = RootStackScreenProps<'HostManagement'>;

const TOP_TABS = ['Host', 'Invite agent'] as const;
type TopTab = (typeof TOP_TABS)[number];

const TYPE_OPTIONS = ['All Type', 'Transfer', 'Recharge', 'Exchange'] as const;

type PendingChange = Awaited<ReturnType<typeof agencyApi.listPendingHostChangeRequests>>[number];
type PendingAgentApp = Awaited<ReturnType<typeof agencyApi.listPendingAgentApplications>>[number];
type PendingHostApp = Awaited<ReturnType<typeof agencyApi.listPendingHostApplications>>[number];

export function HostManagementScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const lastHostCenterTickAt = useSelector((s: RootState) => s.auth.lastHostCenterTickAt);
  const [activeTab, setActiveTab] = useState<TopTab>('Host');
  const [hosts, setHosts] = useState<AgencyHost[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [pendingAgentApps, setPendingAgentApps] = useState<PendingAgentApp[]>([]);
  const [pendingHostApps, setPendingHostApps] = useState<PendingHostApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeOpen, setTypeOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('All Type');
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteAgencyName, setInviteAgencyName] = useState('');
  const [inviteSending, setInviteSending] = useState(false);

  const loadHostsAndPending = useCallback(() => {
    setLoading(true);
    Promise.all([
      agencyApi.getHosts().catch(() => [] as AgencyHost[]),
      agencyApi.listPendingHostChangeRequests().catch(() => []),
      agencyApi.listPendingAgentApplications().catch(() => []),
      agencyApi.listPendingHostApplications().catch(() => []),
    ])
      .then(([h, p, a, ha]) => {
        setHosts(h);
        setPendingChanges(p);
        setPendingAgentApps(a);
        setPendingHostApps(ha);
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHostsAndPending();
    }, [loadHostsAndPending]),
  );

  useEffect(() => {
    if (lastHostCenterTickAt == null) return;
    Promise.all([
      agencyApi.listPendingHostChangeRequests().catch(() => []),
      agencyApi.listPendingAgentApplications().catch(() => []),
      agencyApi.listPendingHostApplications().catch(() => []),
    ]).then(([p, a, ha]) => {
      setPendingChanges(p);
      setPendingAgentApps(a);
      setPendingHostApps(ha);
    });
  }, [lastHostCenterTickAt]);

  const filtered = hosts.filter((h) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      h.host.displayName.toLowerCase().includes(q) ||
      h.host.username.toLowerCase().includes(q) ||
      h.host.id.includes(q)
    );
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTabs}>
          {TOP_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={styles.headerTab}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.headerTabText, activeTab === tab && styles.headerTabTextActive]}>
                {tab}
              </Text>
              {activeTab === tab && <View style={styles.headerTabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ width: 32 }} />
      </View>

      {activeTab === 'Invite agent' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.inviteTitle}>Invite sub-agent</Text>
          <Text style={styles.inviteHint}>
            Enter the user&apos;s internal ID, Haka ID, or username. They will receive a chat invitation to accept or decline.
          </Text>
          <Text style={styles.fieldLbl}>User ID</Text>
          <TextInput
            style={styles.inviteInput}
            value={inviteUserId}
            onChangeText={setInviteUserId}
            placeholder="UUID, Haka ID, or username"
            placeholderTextColor="#BBB"
            autoCapitalize="none"
          />
          <Text style={styles.fieldLbl}>Their agency name (optional)</Text>
          <TextInput
            style={styles.inviteInput}
            value={inviteAgencyName}
            onChangeText={setInviteAgencyName}
            placeholder="Defaults to a suggested name"
            placeholderTextColor="#BBB"
          />
          <TouchableOpacity
            style={[styles.inviteSendBtn, inviteSending && { opacity: 0.6 }]}
            disabled={inviteSending}
            onPress={() => {
              if (!inviteUserId.trim()) {
                Alert.alert('Required', 'Enter a user ID.');
                return;
              }
              setInviteSending(true);
              agencyApi
                .createSubAgentInvitation(inviteUserId.trim(), inviteAgencyName.trim())
                .then(() => {
                  Alert.alert('Sent', 'Invitation sent to their Messages.');
                  setInviteUserId('');
                  setInviteAgencyName('');
                })
                .catch((e: Error) => Alert.alert('Error', e.message))
                .finally(() => setInviteSending(false));
            }}
          >
            <Text style={styles.inviteSendBtnText}>{inviteSending ? 'Sending…' : 'Send invitation'}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      {activeTab === 'Host' ? (
        <>
      {/* Filter row */}
      <View style={styles.filterRow}>
        <TouchableOpacity style={styles.periodBtn}>
          <Text style={styles.periodBtnText}>Last 30 days</Text>
        </TouchableOpacity>
        <View style={styles.filterDivider} />
        <TouchableOpacity style={styles.dateBtn}>
          <Ionicons name="calendar-outline" size={15} color="#666" />
          <Text style={styles.dateBtnText}>Select date</Text>
        </TouchableOpacity>
        <AllTypeFilterDropdown
          value={selectedType}
          onChange={setSelectedType}
          options={TYPE_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
          open={typeOpen}
          onOpenChange={setTypeOpen}
        />
      </View>

      {typeOpen ? (
        <AllTypeFilterBackdrop onPress={() => setTypeOpen(false)} />
      ) : null}

      {pendingAgentApps.length > 0 && (
        <View style={styles.pendingBlock}>
          <Text style={styles.pendingBlockTitle}>Sub-agent applications</Text>
          {pendingAgentApps.map((r) => (
            <View key={r.id} style={styles.pendingCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingName}>{r.user.displayName}</Text>
                <Text style={styles.pendingMeta}>Wants agency: {r.proposedName}</Text>
                {r.country ? <Text style={styles.pendingReason} numberOfLines={1}>{r.country}</Text> : null}
              </View>
              <View style={styles.pendingActions}>
                <TouchableOpacity
                  style={styles.pendingApprove}
                  onPress={() => {
                    Alert.alert('Approve', `Approve ${r.user.displayName} as a sub-agent?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Approve',
                        onPress: () => {
                          agencyApi
                            .approveAgentApplication(r.id, '')
                            .then(() => loadHostsAndPending())
                            .catch((e: Error) => Alert.alert('Error', e.message));
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.pendingApproveText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pendingReject}
                  onPress={() => {
                    Alert.alert('Reject', 'Reject this application?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Reject',
                        style: 'destructive',
                        onPress: () => {
                          agencyApi
                            .rejectAgentApplication(r.id, 'Rejected')
                            .then(() => loadHostsAndPending())
                            .catch((e: Error) => Alert.alert('Error', e.message));
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.pendingRejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {pendingHostApps.length > 0 && (
        <View style={styles.pendingBlock}>
          <Text style={styles.pendingBlockTitle}>Host applications</Text>
          {pendingHostApps.map((r) => (
            <View key={r.id} style={styles.pendingCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingName}>{r.user.displayName}</Text>
                <Text style={styles.pendingMeta}>
                  {r.path === 'agency_invitation' ? 'Invitation' : 'Applied'} · pending
                </Text>
              </View>
              <View style={styles.pendingActions}>
                <TouchableOpacity
                  style={styles.pendingApprove}
                  onPress={() => {
                    Alert.alert('Approve', `Approve ${r.user.displayName} as a host?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Approve',
                        onPress: () => {
                          agencyApi
                            .approveHostApplication(r.id, '')
                            .then(() => loadHostsAndPending())
                            .catch((e: Error) => Alert.alert('Error', e.message));
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.pendingApproveText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pendingReject}
                  onPress={() => {
                    Alert.alert('Reject', 'Reject this host application?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Reject',
                        style: 'destructive',
                        onPress: () => {
                          agencyApi
                            .rejectHostApplication(r.id, '')
                            .then(() => loadHostsAndPending())
                            .catch((e: Error) => Alert.alert('Error', e.message));
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.pendingRejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {pendingChanges.length > 0 && (
        <View style={styles.pendingBlock}>
          <Text style={styles.pendingBlockTitle}>Host agency requests</Text>
          {pendingChanges.map((r) => (
            <View key={r.id} style={styles.pendingCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingName}>{r.user.displayName}</Text>
                <Text style={styles.pendingMeta}>
                  {r.type === 'leave' ? 'Wants to leave agency' : 'Wants to change agency'}
                </Text>
                {r.reason ? <Text style={styles.pendingReason} numberOfLines={2}>{r.reason}</Text> : null}
              </View>
              <View style={styles.pendingActions}>
                <TouchableOpacity
                  style={styles.pendingApprove}
                  onPress={() => {
                    Alert.alert('Approve request', `Approve this ${r.type} request?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Approve',
                        onPress: () => {
                          agencyApi
                            .approveHostChangeRequest(r.id)
                            .then(() => loadHostsAndPending())
                            .catch((e: Error) => Alert.alert('Error', e.message));
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.pendingApproveText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pendingReject}
                  onPress={() => {
                    Alert.alert('Reject request', 'Reject this request?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Reject',
                        style: 'destructive',
                        onPress: () => {
                          agencyApi
                            .rejectHostChangeRequest(r.id, '')
                            .then(() => loadHostsAndPending())
                            .catch((e: Error) => Alert.alert('Error', e.message));
                        },
                      },
                    ]);
                  }}
                >
                  <Text style={styles.pendingRejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Search row */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <TextInput
            style={styles.searchField}
            placeholder="Please input the user id"
            placeholderTextColor="#BBB"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          <Ionicons name="search-outline" size={18} color="#BBB" />
        </View>
        <TouchableOpacity style={styles.searchBtn}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Table header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, { flex: 2 }]}>User</Text>
        <Text style={styles.tableHeaderCell}>Beans/mo</Text>
        <Text style={styles.tableHeaderCell}>Comm/mo</Text>
      </View>

      {/* Host list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.host.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <HostRow host={item} />}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No hosts found</Text>
            </View>
          )
        }
      />
        </>
      ) : null}
    </View>
  );
}

function HostRow({ host }: { host: AgencyHost }) {
  const initials = host.host.displayName.slice(0, 2).toUpperCase();
  return (
    <View style={styles.hostRow}>
      {/* Avatar */}
      <View style={styles.hostAvatarWrap}>
        {host.host.avatar ? (
          <Image source={{ uri: host.host.avatar }} style={styles.hostAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.hostAvatar, styles.hostAvatarFallback]}>
            <Text style={styles.hostAvatarInitials}>{initials}</Text>
          </View>
        )}
      </View>
      {/* Info */}
      <View style={styles.hostInfo}>
        <Text style={styles.hostName} numberOfLines={1}>{host.host.displayName}</Text>
        <View style={styles.hostIdRow}>
          <Text style={styles.hostId}>{host.host.id.slice(0, 7)}</Text>
          <Ionicons name="copy-outline" size={12} color="#AAA" />
        </View>
        <View style={styles.hakaBadge}>
          <Text style={styles.hakaBadgeText}>HAKA</Text>
        </View>
      </View>
      {/* Monthly beans */}
      <View style={styles.hostStatCol}>
        <Text style={styles.hostStatValue}>{host.monthly_beans.toLocaleString()}</Text>
        <Text style={styles.hostStatLabel}>beans</Text>
      </View>
      {/* Monthly commission */}
      <View style={styles.hostStatCol}>
        <Text style={styles.hostStatValue}>{host.monthly_commission.toLocaleString()}</Text>
        <Text style={styles.hostStatLabel}>comm</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F0F7F4' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: '#FFF',
  },
  headerTabs: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  headerTab: {
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    position: 'relative',
  },
  headerTabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#999',
  },
  headerTabTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  headerTabUnderline: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#000',
    borderRadius: 1,
  },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: '#FFF',
    marginTop: 1,
  },
  periodBtn: { paddingRight: Spacing.sm },
  periodBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  filterDivider: { width: 1, height: 16, backgroundColor: '#E0E0E0', marginHorizontal: Spacing.sm },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  dateBtnText: { fontSize: 13, color: '#666' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: '#FFF',
    gap: Spacing.md,
    marginTop: 1,
  },
  searchInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    height: 38,
    gap: Spacing.sm,
  },
  searchField: {
    flex: 1,
    fontSize: 13,
    color: '#333',
  },
  searchBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  searchBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginTop: 1,
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },

  listContent: {
    paddingBottom: 40,
    backgroundColor: '#FFF',
  },
  separator: {
    height: 1,
    backgroundColor: '#E8F5F0',
    marginLeft: Spacing.lg,
  },

  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: '#FFF',
    gap: Spacing.sm,
  },
  hostAvatarWrap: { marginRight: Spacing.xs },
  hostAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  hostAvatarFallback: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostAvatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  hostInfo: {
    flex: 2,
    gap: 2,
  },
  hostName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  hostIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hostId: {
    fontSize: 12,
    color: '#666',
  },
  hakaBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  hakaBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  hostStatCol: {
    flex: 1,
    alignItems: 'center',
  },
  hostStatValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  hostStatLabel: {
    fontSize: 10,
    color: '#888',
    textAlign: 'center',
    marginTop: 1,
  },

  pendingBlock: {
    backgroundColor: '#FFF8E6',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E0C0',
    gap: Spacing.sm,
  },
  pendingBlockTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E8E0D0',
    gap: Spacing.sm,
  },
  pendingName: { fontSize: 14, fontWeight: '700', color: '#000' },
  pendingMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  pendingReason: { fontSize: 11, color: '#888', marginTop: 4 },
  pendingActions: { gap: Spacing.xs },
  pendingApprove: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  pendingApproveText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  pendingReject: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#CCC',
    alignItems: 'center',
  },
  pendingRejectText: { color: '#C00', fontSize: 12, fontWeight: '600' },

  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },

  inviteTitle: { fontSize: 18, fontWeight: '700', color: '#000', marginBottom: Spacing.sm },
  inviteHint: { fontSize: 13, color: '#666', marginBottom: Spacing.lg, lineHeight: 20 },
  fieldLbl: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: Spacing.xs },
  inviteInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: '#000',
    marginBottom: Spacing.md,
    backgroundColor: '#FFF',
  },
  inviteSendBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  inviteSendBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
