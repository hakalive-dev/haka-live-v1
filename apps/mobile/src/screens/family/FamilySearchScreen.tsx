import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { familyApi } from '@api/family';
import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import type { Family } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'FamilySearch'>;

const TIER_COLORS: Record<string, [string, string]> = {
  bronze: ['#CD7F32', '#8B4513'],
  silver: ['#C0C0C0', '#808080'],
  gold:   ['#FFD700', '#B8860B'],
};

export function FamilySearchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery]       = useState('');
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading]   = useState(true);
  const [joining, setJoining]   = useState<string | null>(null);

  const search = useCallback((q: string) => {
    setLoading(true);
    familyApi.list(1, q || undefined)
      .then((result) => setFamilies(result.items))
      .catch(() => setFamilies([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { search(''); }, [search]);

  const handleJoin = useCallback((family: Family) => {
    Alert.alert(
      'Join Family',
      `Join "${family.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          onPress: async () => {
            setJoining(family.id);
            try {
              await familyApi.join(family.id);
              Alert.alert('Joined!', `Welcome to ${family.name}!`, [
                { text: 'OK', onPress: () => navigation.replace('FamilyHub') },
              ]);
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
            } finally {
              setJoining(null);
            }
          },
        },
      ],
    );
  }, [navigation]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find a Family</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={(t) => { setQuery(t); search(t); }}
          placeholder="Search families..."
          placeholderTextColor={Colors.textTertiary}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); search(''); }} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ListRowSkeleton rows={8} />
      ) : (
        <FlatList
          data={families}
          keyExtractor={(f) => f.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="people-outline" size={40} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No families found</Text>
            </View>
          }
          renderItem={({ item }) => {
            const tierColors = TIER_COLORS[item.tier] ?? TIER_COLORS.bronze;
            return (
              <View style={styles.card}>
                <LinearGradient colors={tierColors} style={styles.cardBadge}>
                  <Text style={styles.cardEmoji}>{item.badge || '🏠'}</Text>
                </LinearGradient>

                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.tierPill}>
                      <Text style={styles.tierPillText}>{item.tier.toUpperCase()}</Text>
                    </View>
                  </View>
                  {item.announcement ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>{item.announcement}</Text>
                  ) : null}
                  <View style={styles.cardStats}>
                    <Ionicons name="people" size={12} color={Colors.textTertiary} />
                    <Text style={styles.cardStat}>{item._count.members} members</Text>
                    <Text style={styles.cardStatDot}>·</Text>
                    <Text style={styles.cardStat}>{item.weeklyBeans.toLocaleString()} beans</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.joinBtn, joining === item.id && styles.joinBtnDisabled]}
                  onPress={() => handleJoin(item)}
                  disabled={joining === item.id}
                >
                  <Text style={styles.joinBtnText}>Join</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
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

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md,
    height: 48,
  },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 15 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxxl },

  emptyBox: { alignItems: 'center', paddingTop: 60, gap: Spacing.sm },
  emptyText: { color: Colors.textTertiary, fontSize: 14 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
  },
  cardBadge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cardEmoji: { fontSize: 26 },
  cardBody:  { flex: 1, gap: 4 },
  cardTop:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardName:  { color: Colors.textPrimary, fontSize: 14, fontWeight: '700', flex: 1 },
  tierPill: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  tierPillText: { color: Colors.textTertiary, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  cardDesc: { color: Colors.textSecondary, fontSize: 12 },
  cardStats: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardStat:  { color: Colors.textTertiary, fontSize: 11 },
  cardStatDot: { color: Colors.textTertiary, fontSize: 11 },

  joinBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minWidth: 60, alignItems: 'center',
  },
  joinBtnDisabled: { opacity: 0.5 },
  joinBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
