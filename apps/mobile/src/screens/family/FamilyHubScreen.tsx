import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector } from 'react-redux';

import { familyApi } from '@api/family';
import { Colors, Radius, Spacing } from '@/theme';
import { FamilySkeleton } from '@components/Skeleton';
import type { FamilyDetail, FamilyMember, FamilyMemberRole } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '../../store';

type Props = RootStackScreenProps<'FamilyHub'>;

const TIER_COLORS: Record<string, [string, string]> = {
  bronze: ['#CD7F32', '#8B4513'],
  silver: ['#C0C0C0', '#808080'],
  gold:   ['#FFD700', '#B8860B'],
};

const ROLE_LABEL: Record<FamilyMemberRole, string> = {
  owner:  '👑 Owner',
  admin:  '⭐ Admin',
  member: 'Member',
};

export function FamilyHubScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const authUser = useSelector((s: RootState) => s.auth.user);
  const [family, setFamily] = useState<FamilyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setError(false);
      familyApi.getMyFamily()
        .then(setFamily)
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }, []),
  );

  const myRole = family?.members?.find((m) => m.user.id === authUser?.id)?.role ?? null;

  const handleLeave = useCallback(() => {
    if (!family) return;
    if (myRole === 'owner') {
      Alert.alert('Cannot Leave', 'As the owner, you must disband the family or transfer ownership first.');
      return;
    }
    Alert.alert(
      'Leave Family',
      `Are you sure you want to leave "${family.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await familyApi.leave();
              setFamily(null);
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
            }
          },
        },
      ],
    );
  }, [family, myRole]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Family</Text>
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
        <FamilyContent
          family={family}
          myRole={myRole}
          onLeave={handleLeave}
          onViewDetail={() =>
            navigation.navigate('FamilyDetail', { familyId: family.id, familyName: family.name })
          }
        />
      ) : (
        <NoFamilyState
          onSearch={() => navigation.navigate('FamilySearch')}
          onCreate={() => navigation.navigate('CreateFamily')}
        />
      )}
    </View>
  );
}

// ── Has family ────────────────────────────────────────────────────────────────

function FamilyContent({
  family,
  myRole,
  onLeave,
  onViewDetail,
}: {
  family: FamilyDetail;
  myRole: FamilyMemberRole | null;
  onLeave: () => void;
  onViewDetail: () => void;
}) {
  const insets = useSafeAreaInsets();
  const tierColors = TIER_COLORS[family.tier] ?? TIER_COLORS.bronze;
  const memberCount = family._count.members;
  const weeklyBeans = family.weeklyBeans;

  return (
    <FlatList
      data={family.members}
      keyExtractor={(m) => m.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
      ListHeaderComponent={
        <>
          {/* Family hero card */}
          <LinearGradient colors={tierColors} style={styles.heroCard}>
            <Text style={styles.heroBadge}>{family.badge || '🏠'}</Text>
            <Text style={styles.heroName}>{family.name}</Text>
            <Text style={styles.heroTier}>{family.tier.toUpperCase()} FAMILY</Text>

            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{memberCount}</Text>
                <Text style={styles.heroStatLbl}>Members</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{weeklyBeans.toLocaleString()}</Text>
                <Text style={styles.heroStatLbl}>Weekly Beans</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{myRole ? ROLE_LABEL[myRole] : '—'}</Text>
                <Text style={styles.heroStatLbl}>My Role</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={onViewDetail}>
              <Ionicons name="people" size={16} color={Colors.primary} />
              <Text style={styles.actionBtnText}>Manage</Text>
            </TouchableOpacity>
            {myRole !== 'owner' && (
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={onLeave}>
                <Ionicons name="exit-outline" size={16} color={Colors.danger} />
                <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Leave</Text>
              </TouchableOpacity>
            )}
          </View>

          {family.announcement ? (
            <View style={styles.announcementCard}>
              <Ionicons name="megaphone" size={14} color={Colors.primaryLight} />
              <Text style={styles.announcementText}>{family.announcement}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Members</Text>
        </>
      }
      renderItem={({ item }) => <MemberRow member={item} />}
    />
  );
}

function MemberRow({ member }: { member: FamilyMember }) {
  const initial = (member.user.displayName || '?')[0]?.toUpperCase() ?? '?';
  return (
    <View style={styles.memberRow}>
      <View style={styles.memberAvatar}>
        <Text style={styles.memberAvatarText}>{initial}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{member.user.displayName}</Text>
        <Text style={styles.memberRank}>{ROLE_LABEL[member.role] ?? member.role}</Text>
      </View>
    </View>
  );
}

// ── No family ─────────────────────────────────────────────────────────────────

function NoFamilyState({
  onSearch,
  onCreate,
}: {
  onSearch: () => void;
  onCreate: () => void;
}) {
  return (
    <View style={styles.noFamilyWrap}>
      <Text style={styles.noFamilyEmoji}>🏠</Text>
      <Text style={styles.noFamilyTitle}>You're not in a family yet</Text>
      <Text style={styles.noFamilySubtitle}>
        Join a family to earn beans together and climb the family leaderboard.
      </Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={onSearch}>
        <Ionicons name="search" size={18} color="#FFFFFF" />
        <Text style={styles.primaryBtnText}>Find a Family</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.outlineBtn} onPress={onCreate}>
        <Text style={styles.outlineBtnText}>Create Your Own</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

  heroCard: {
    margin: Spacing.lg, borderRadius: Radius.lg,
    padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm,
  },
  heroBadge: { fontSize: 48 },
  heroName:  { color: '#FFFFFF', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  heroTier:  { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  heroStats: { flexDirection: 'row', gap: Spacing.xl, marginTop: Spacing.sm },
  heroStat:  { alignItems: 'center', gap: 2 },
  heroStatVal: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  heroStatLbl: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },

  announcementCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.primarySubtle, borderRadius: Radius.md,
    padding: Spacing.md,
  },
  announcementText: { flex: 1, color: Colors.primaryLight, fontSize: 13, lineHeight: 18 },

  actionRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.sm,
  },
  actionBtn: {
    flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.primary, backgroundColor: Colors.primarySubtle,
  },
  actionBtnDanger: { borderColor: Colors.danger, backgroundColor: 'transparent' },
  actionBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },

  sectionTitle: {
    color: Colors.textSecondary, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
  },

  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.md,
  },
  memberAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surfaceHighlight, alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  memberRank: { color: Colors.textTertiary, fontSize: 12, marginTop: 1 },

  noFamilyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, gap: Spacing.md,
  },
  noFamilyEmoji:    { fontSize: 64 },
  noFamilyTitle:    { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  noFamilySubtitle: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    height: 52, backgroundColor: Colors.primary, borderRadius: Radius.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingHorizontal: Spacing.xxl, marginTop: Spacing.md,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  outlineBtn: {
    height: 44, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl,
  },
  outlineBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
