import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';

import { familyApi } from '@api/family';
import { Colors, Radius, Spacing } from '@/theme';
import { FamilySkeleton } from '@components/Skeleton';
import type { FamilyDetail, FamilyMember, FamilyMemberRole } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '@store/index';

type Props = RootStackScreenProps<'FamilyDetail'>;

const ROLE_LABEL: Record<FamilyMemberRole, string> = {
  owner:  '👑 Owner',
  admin:  '⭐ Admin',
  member: 'Member',
};

export function FamilyDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { familyId, familyName } = route.params;
  const currentUser = useSelector((state: RootState) => state.auth.user);

  const [family, setFamily]         = useState<FamilyDetail | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [actionTarget, setActionTarget] = useState<FamilyMember | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    familyApi.get(familyId)
      .then(setFamily)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [familyId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const myMembership = family?.members?.find((m) => m.user.id === currentUser?.id);
  const isOwner = myMembership?.role === 'owner';

  const handleKick = useCallback((member: FamilyMember) => {
    Alert.alert(
      'Kick Member',
      `Remove ${member.user.displayName} from the family?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kick',
          style: 'destructive',
          onPress: async () => {
            try {
              await familyApi.kickMember(member.user.id);
              reload();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
            }
          },
        },
      ],
    );
  }, [reload]);

  const handlePromote = useCallback(async (member: FamilyMember) => {
    try {
      await familyApi.promoteMember(member.user.id);
      setActionTarget(null);
      reload();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
    }
  }, [reload]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{familyName}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <FamilySkeleton />
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorText}>Failed to load</Text>
        </View>
      ) : family ? (
        <FlatList
          data={family.members}
          keyExtractor={(m) => m.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{family.totalBeans.toLocaleString()}</Text>
                <Text style={styles.statLbl}>Total Beans</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{family._count.members}</Text>
                <Text style={styles.statLbl}>Members</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statVal, { textTransform: 'capitalize' }]}>{family.tier}</Text>
                <Text style={styles.statLbl}>Tier</Text>
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const isSelf    = item.user.id === currentUser?.id;
            const canManage = isOwner && !isSelf && item.role !== 'owner';
            return (
              <View style={styles.memberRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(item.user.displayName || '?')[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {item.user.displayName}
                    {isSelf && <Text style={styles.youTag}> (You)</Text>}
                  </Text>
                  <Text style={styles.memberRank}>{ROLE_LABEL[item.role] ?? item.role}</Text>
                </View>
                {canManage && (
                  <TouchableOpacity
                    style={styles.moreBtn}
                    onPress={() => setActionTarget(item)}
                    hitSlop={8}
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color={Colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      ) : null}

      {/* Member action modal */}
      <Modal
        visible={actionTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActionTarget(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setActionTarget(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{actionTarget?.user.displayName}</Text>

          {actionTarget?.role === 'member' && (
            <TouchableOpacity
              style={styles.rankOption}
              onPress={() => actionTarget && handlePromote(actionTarget)}
            >
              <Text style={styles.rankOptionText}>⭐ Promote to Admin</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.kickBtn}
            onPress={() => {
              const m = actionTarget;
              setActionTarget(null);
              if (m) setTimeout(() => handleKick(m), 100);
            }}
          >
            <Ionicons name="person-remove-outline" size={16} color={Colors.danger} />
            <Text style={styles.kickBtnText}>Kick from Family</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: Colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { color: Colors.textSecondary, fontSize: 14 },
  listContent: { paddingBottom: Spacing.xxxl },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
    alignItems: 'center', gap: 4,
  },
  statVal: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  statLbl: { color: Colors.textTertiary, fontSize: 10 },

  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.md,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surfaceHighlight, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  youTag: { color: Colors.textTertiary, fontWeight: '400' },
  memberRank: { color: Colors.textTertiary, fontSize: 12, marginTop: 1 },
  moreBtn: { padding: 4 },

  backdrop: { flex: 1, backgroundColor: 'transparent' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: Spacing.sm, paddingHorizontal: Spacing.lg, gap: Spacing.sm,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.sm },
  sheetTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', textAlign: 'center', paddingBottom: Spacing.sm },
  rankOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
  },
  rankOptionText: { color: Colors.textSecondary, fontSize: 14 },
  kickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, height: 48, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.danger, marginTop: Spacing.sm,
  },
  kickBtnText: { color: Colors.danger, fontSize: 14, fontWeight: '600' },
});
