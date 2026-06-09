import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useSelector } from 'react-redux';

import { useUserLevelQuery, useLevelTiersQuery } from '@hooks/queries/useLevelQueries';
import { Colors, Radius, Spacing } from '@/theme';
import { CharmLevelBadge } from '@components/CharmLevelBadge';
import { RichLevelBadge } from '@components/RichLevelBadge';
import { LevelSkeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import type { LevelTierInfo } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '../../store';

type Props = RootStackScreenProps<'Level'>;

// ── Complete rich level icon map (caifu_level_1 … caifu_level_100) ────────────

export const RICH: Record<number, ReturnType<typeof require>> = {
  0:   require('../../../assets/rich_levels/caifu_level_1.png'),
  1:   require('../../../assets/rich_levels/caifu_level_1.png'),
  2:   require('../../../assets/rich_levels/caifu_level_2.png'),
  3:   require('../../../assets/rich_levels/caifu_level_3.png'),
  4:   require('../../../assets/rich_levels/caifu_level_4.png'),
  5:   require('../../../assets/rich_levels/caifu_level_5.png'),
  6:   require('../../../assets/rich_levels/caifu_level_6.png'),
  7:   require('../../../assets/rich_levels/caifu_level_7.png'),
  8:   require('../../../assets/rich_levels/caifu_level_8.png'),
  9:   require('../../../assets/rich_levels/caifu_level_9.png'),
  10:  require('../../../assets/rich_levels/caifu_level_10.png'),
  11:  require('../../../assets/rich_levels/caifu_level_11.png'),
  12:  require('../../../assets/rich_levels/caifu_level_12.png'),
  13:  require('../../../assets/rich_levels/caifu_level_13.png'),
  14:  require('../../../assets/rich_levels/caifu_level_14.png'),
  15:  require('../../../assets/rich_levels/caifu_level_15.png'),
  16:  require('../../../assets/rich_levels/caifu_level_16.png'),
  17:  require('../../../assets/rich_levels/caifu_level_17.png'),
  18:  require('../../../assets/rich_levels/caifu_level_18.png'),
  19:  require('../../../assets/rich_levels/caifu_level_19.png'),
  20:  require('../../../assets/rich_levels/caifu_level_20.png'),
  21:  require('../../../assets/rich_levels/caifu_level_21.png'),
  22:  require('../../../assets/rich_levels/caifu_level_22.png'),
  23:  require('../../../assets/rich_levels/caifu_level_23.png'),
  24:  require('../../../assets/rich_levels/caifu_level_24.png'),
  25:  require('../../../assets/rich_levels/caifu_level_25.png'),
  26:  require('../../../assets/rich_levels/caifu_level_26.png'),
  27:  require('../../../assets/rich_levels/caifu_level_27.png'),
  28:  require('../../../assets/rich_levels/caifu_level_28.png'),
  29:  require('../../../assets/rich_levels/caifu_level_29.png'),
  30:  require('../../../assets/rich_levels/caifu_level_30.png'),
  31:  require('../../../assets/rich_levels/caifu_level_31.png'),
  32:  require('../../../assets/rich_levels/caifu_level_32.png'),
  33:  require('../../../assets/rich_levels/caifu_level_33.png'),
  34:  require('../../../assets/rich_levels/caifu_level_34.png'),
  35:  require('../../../assets/rich_levels/caifu_level_35.png'),
  36:  require('../../../assets/rich_levels/caifu_level_36.png'),
  37:  require('../../../assets/rich_levels/caifu_level_37.png'),
  38:  require('../../../assets/rich_levels/caifu_level_38.png'),
  39:  require('../../../assets/rich_levels/caifu_level_39.png'),
  40:  require('../../../assets/rich_levels/caifu_level_40.png'),
  41:  require('../../../assets/rich_levels/caifu_level_41.png'),
  42:  require('../../../assets/rich_levels/caifu_level_42.png'),
  43:  require('../../../assets/rich_levels/caifu_level_43.png'),
  44:  require('../../../assets/rich_levels/caifu_level_44.png'),
  45:  require('../../../assets/rich_levels/caifu_level_45.png'),
  46:  require('../../../assets/rich_levels/caifu_level_46.png'),
  47:  require('../../../assets/rich_levels/caifu_level_47.png'),
  48:  require('../../../assets/rich_levels/caifu_level_48.png'),
  49:  require('../../../assets/rich_levels/caifu_level_49.png'),
  50:  require('../../../assets/rich_levels/caifu_level_50.png'),
  51:  require('../../../assets/rich_levels/caifu_level_51.png'),
  52:  require('../../../assets/rich_levels/caifu_level_52.png'),
  53:  require('../../../assets/rich_levels/caifu_level_53.png'),
  54:  require('../../../assets/rich_levels/caifu_level_54.png'),
  55:  require('../../../assets/rich_levels/caifu_level_55.png'),
  56:  require('../../../assets/rich_levels/caifu_level_56.png'),
  57:  require('../../../assets/rich_levels/caifu_level_57.png'),
  58:  require('../../../assets/rich_levels/caifu_level_58.png'),
  59:  require('../../../assets/rich_levels/caifu_level_59.png'),
  60:  require('../../../assets/rich_levels/caifu_level_60.png'),
  61:  require('../../../assets/rich_levels/caifu_level_61.png'),
  62:  require('../../../assets/rich_levels/caifu_level_62.png'),
  63:  require('../../../assets/rich_levels/caifu_level_63.png'),
  64:  require('../../../assets/rich_levels/caifu_level_64.png'),
  65:  require('../../../assets/rich_levels/caifu_level_65.png'),
  66:  require('../../../assets/rich_levels/caifu_level_66.png'),
  67:  require('../../../assets/rich_levels/caifu_level_67.png'),
  68:  require('../../../assets/rich_levels/caifu_level_68.png'),
  69:  require('../../../assets/rich_levels/caifu_level_69.png'),
  70:  require('../../../assets/rich_levels/caifu_level_70.png'),
  71:  require('../../../assets/rich_levels/caifu_level_71.png'),
  72:  require('../../../assets/rich_levels/caifu_level_72.png'),
  73:  require('../../../assets/rich_levels/caifu_level_73.png'),
  74:  require('../../../assets/rich_levels/caifu_level_74.png'),
  75:  require('../../../assets/rich_levels/caifu_level_75.png'),
  76:  require('../../../assets/rich_levels/caifu_level_76.png'),
  77:  require('../../../assets/rich_levels/caifu_level_77.png'),
  78:  require('../../../assets/rich_levels/caifu_level_78.png'),
  79:  require('../../../assets/rich_levels/caifu_level_79.png'),
  80:  require('../../../assets/rich_levels/caifu_level_80.png'),
  81:  require('../../../assets/rich_levels/caifu_level_81.png'),
  82:  require('../../../assets/rich_levels/caifu_level_82.png'),
  83:  require('../../../assets/rich_levels/caifu_level_83.png'),
  84:  require('../../../assets/rich_levels/caifu_level_84.png'),
  85:  require('../../../assets/rich_levels/caifu_level_85.png'),
  86:  require('../../../assets/rich_levels/caifu_level_86.png'),
  87:  require('../../../assets/rich_levels/caifu_level_87.png'),
  88:  require('../../../assets/rich_levels/caifu_level_88.png'),
  89:  require('../../../assets/rich_levels/caifu_level_89.png'),
  90:  require('../../../assets/rich_levels/caifu_level_90.png'),
  91:  require('../../../assets/rich_levels/caifu_level_91.png'),
  92:  require('../../../assets/rich_levels/caifu_level_92.png'),
  93:  require('../../../assets/rich_levels/caifu_level_93.png'),
  94:  require('../../../assets/rich_levels/caifu_level_94.png'),
  95:  require('../../../assets/rich_levels/caifu_level_95.png'),
  96:  require('../../../assets/rich_levels/caifu_level_96.png'),
  97:  require('../../../assets/rich_levels/caifu_level_97.png'),
  98:  require('../../../assets/rich_levels/caifu_level_98.png'),
  99:  require('../../../assets/rich_levels/caifu_level_99.png'),
  100: require('../../../assets/rich_levels/caifu_level_100.png'),
};

// ── Complete charm level icon map ─────────────────────────────────────────────
// Levels 0–79: division_live_levelN.png  |  Levels 80–100: level_N.png

export const CHARM: Record<number, ReturnType<typeof require>> = {
  0:   require('../../../assets/charm_levels/division_live_level0.png'),
  1:   require('../../../assets/charm_levels/division_live_level1.png'),
  2:   require('../../../assets/charm_levels/division_live_level2.png'),
  3:   require('../../../assets/charm_levels/division_live_level3.png'),
  4:   require('../../../assets/charm_levels/division_live_level4.png'),
  5:   require('../../../assets/charm_levels/division_live_level5.png'),
  6:   require('../../../assets/charm_levels/division_live_level6.png'),
  7:   require('../../../assets/charm_levels/division_live_level7.png'),
  8:   require('../../../assets/charm_levels/division_live_level8.png'),
  9:   require('../../../assets/charm_levels/division_live_level9.png'),
  10:  require('../../../assets/charm_levels/division_live_level10.png'),
  11:  require('../../../assets/charm_levels/division_live_level11.png'),
  12:  require('../../../assets/charm_levels/division_live_level12.png'),
  13:  require('../../../assets/charm_levels/division_live_level13.png'),
  14:  require('../../../assets/charm_levels/division_live_level14.png'),
  15:  require('../../../assets/charm_levels/division_live_level15.png'),
  16:  require('../../../assets/charm_levels/division_live_level16.png'),
  17:  require('../../../assets/charm_levels/division_live_level17.png'),
  18:  require('../../../assets/charm_levels/division_live_level18.png'),
  19:  require('../../../assets/charm_levels/division_live_level19.png'),
  20:  require('../../../assets/charm_levels/division_live_level20.png'),
  21:  require('../../../assets/charm_levels/division_live_level21.png'),
  22:  require('../../../assets/charm_levels/division_live_level22.png'),
  23:  require('../../../assets/charm_levels/division_live_level23.png'),
  24:  require('../../../assets/charm_levels/division_live_level24.png'),
  25:  require('../../../assets/charm_levels/division_live_level25.png'),
  26:  require('../../../assets/charm_levels/division_live_level26.png'),
  27:  require('../../../assets/charm_levels/division_live_level27.png'),
  28:  require('../../../assets/charm_levels/division_live_level28.png'),
  29:  require('../../../assets/charm_levels/division_live_level29.png'),
  30:  require('../../../assets/charm_levels/division_live_level30.png'),
  31:  require('../../../assets/charm_levels/division_live_level31.png'),
  32:  require('../../../assets/charm_levels/division_live_level32.png'),
  33:  require('../../../assets/charm_levels/division_live_level33.png'),
  34:  require('../../../assets/charm_levels/division_live_level34.png'),
  35:  require('../../../assets/charm_levels/division_live_level35.png'),
  36:  require('../../../assets/charm_levels/division_live_level36.png'),
  37:  require('../../../assets/charm_levels/division_live_level37.png'),
  38:  require('../../../assets/charm_levels/division_live_level38.png'),
  39:  require('../../../assets/charm_levels/division_live_level39.png'),
  40:  require('../../../assets/charm_levels/division_live_level40.png'),
  41:  require('../../../assets/charm_levels/division_live_level41.png'),
  42:  require('../../../assets/charm_levels/division_live_level42.png'),
  43:  require('../../../assets/charm_levels/division_live_level43.png'),
  44:  require('../../../assets/charm_levels/division_live_level44.png'),
  45:  require('../../../assets/charm_levels/division_live_level45.png'),
  46:  require('../../../assets/charm_levels/division_live_level46.png'),
  47:  require('../../../assets/charm_levels/division_live_level47.png'),
  48:  require('../../../assets/charm_levels/division_live_level48.png'),
  49:  require('../../../assets/charm_levels/division_live_level49.png'),
  50:  require('../../../assets/charm_levels/division_live_level50.png'),
  51:  require('../../../assets/charm_levels/division_live_level51.png'),
  52:  require('../../../assets/charm_levels/division_live_level52.png'),
  53:  require('../../../assets/charm_levels/division_live_level53.png'),
  54:  require('../../../assets/charm_levels/division_live_level54.png'),
  55:  require('../../../assets/charm_levels/division_live_level55.png'),
  56:  require('../../../assets/charm_levels/division_live_level56.png'),
  57:  require('../../../assets/charm_levels/division_live_level57.png'),
  58:  require('../../../assets/charm_levels/division_live_level58.png'),
  59:  require('../../../assets/charm_levels/division_live_level59.png'),
  60:  require('../../../assets/charm_levels/division_live_level60.png'),
  61:  require('../../../assets/charm_levels/division_live_level61.png'),
  62:  require('../../../assets/charm_levels/division_live_level62.png'),
  63:  require('../../../assets/charm_levels/division_live_level63.png'),
  64:  require('../../../assets/charm_levels/division_live_level64.png'),
  65:  require('../../../assets/charm_levels/division_live_level65.png'),
  66:  require('../../../assets/charm_levels/division_live_level66.png'),
  67:  require('../../../assets/charm_levels/division_live_level67.png'),
  68:  require('../../../assets/charm_levels/division_live_level68.png'),
  69:  require('../../../assets/charm_levels/division_live_level69.png'),
  70:  require('../../../assets/charm_levels/division_live_level70.png'),
  71:  require('../../../assets/charm_levels/division_live_level71.png'),
  72:  require('../../../assets/charm_levels/division_live_level72.png'),
  73:  require('../../../assets/charm_levels/division_live_level73.png'),
  74:  require('../../../assets/charm_levels/division_live_level74.png'),
  75:  require('../../../assets/charm_levels/division_live_level75.png'),
  76:  require('../../../assets/charm_levels/division_live_level76.png'),
  77:  require('../../../assets/charm_levels/division_live_level77.png'),
  78:  require('../../../assets/charm_levels/division_live_level78.png'),
  79:  require('../../../assets/charm_levels/division_live_level79.png'),
  80:  require('../../../assets/charm_levels/level_80.png'),
  81:  require('../../../assets/charm_levels/level_81.png'),
  82:  require('../../../assets/charm_levels/level_82.png'),
  83:  require('../../../assets/charm_levels/level_83.png'),
  84:  require('../../../assets/charm_levels/level_84.png'),
  85:  require('../../../assets/charm_levels/level_85.png'),
  86:  require('../../../assets/charm_levels/level_86.png'),
  87:  require('../../../assets/charm_levels/level_87.png'),
  88:  require('../../../assets/charm_levels/level_88.png'),
  89:  require('../../../assets/charm_levels/level_89.png'),
  90:  require('../../../assets/charm_levels/level_90.png'),
  91:  require('../../../assets/charm_levels/level_91.png'),
  92:  require('../../../assets/charm_levels/level_92.png'),
  93:  require('../../../assets/charm_levels/level_93.png'),
  94:  require('../../../assets/charm_levels/level_94.png'),
  95:  require('../../../assets/charm_levels/level_95.png'),
  96:  require('../../../assets/charm_levels/level_96.png'),
  97:  require('../../../assets/charm_levels/level_97.png'),
  98:  require('../../../assets/charm_levels/level_98.png'),
  99:  require('../../../assets/charm_levels/level_99.png'),
  100: require('../../../assets/charm_levels/level_100.png'),
};

// Dominant color sampled from each badge PNG (see tools/extract_badge_colors.py)
export const RICH_COLORS: Record<number, string> = {
  1:"#AED35F",2:"#A2D45C",3:"#A3D45C",4:"#AED35F",5:"#EFDF38",6:"#EFE038",7:"#EFDF38",8:"#EFDF38",9:"#EFDF38",
  10:"#F28A03",11:"#F28903",12:"#F28903",13:"#F28A03",14:"#F28903",15:"#F28A03",16:"#F28903",17:"#F28A03",18:"#F28A03",19:"#F28A03",
  20:"#F27005",21:"#F17005",22:"#F27005",23:"#F27105",24:"#F27106",25:"#F27105",26:"#F27005",27:"#F17005",28:"#F27105",29:"#F27005",
  30:"#F1039E",31:"#F1039E",32:"#F1039F",33:"#F1039E",34:"#F1039F",35:"#F1039E",36:"#F1039E",37:"#F1039E",38:"#F1039F",39:"#F1039E",
  40:"#AA06C9",41:"#AB06C9",42:"#AB06C9",43:"#AB06C9",44:"#AB06C8",45:"#AA06C8",46:"#AB06C9",47:"#AB06C9",48:"#AB06C9",49:"#AA06C9",
  50:"#7206C6",51:"#7205C4",52:"#7206C5",53:"#7205C5",54:"#7105C3",55:"#7206C5",56:"#7206C5",57:"#7205C4",58:"#7206C6",59:"#7106C5",
  60:"#2E05EA",61:"#2F05E9",62:"#2F05EA",63:"#2F05EA",64:"#2F05EA",65:"#2F05EA",66:"#2F05EA",67:"#2F05EA",68:"#2F05EA",69:"#2F05EA",
  70:"#3C20C5",71:"#3C20C4",72:"#3B20C4",73:"#3C20C4",74:"#3B20C5",75:"#3C20C5",76:"#3B1FC4",77:"#3B20C5",78:"#3C20C5",79:"#3B20C4",
  80:"#D42602",81:"#D52502",82:"#D42703",83:"#D42703",84:"#D42502",85:"#D42703",86:"#D42602",87:"#D42602",88:"#D42602",89:"#D42703",
  90:"#D10101",91:"#E60B1C",92:"#D10101",93:"#D10101",94:"#E60B1D",95:"#E50B1D",96:"#D10101",97:"#E50B1C",98:"#D10101",99:"#D10101",100:"#CF0155",
};

export const CHARM_COLORS: Record<number, string> = {
  0:"#AE735F",1:"#AD725F",2:"#AC725F",3:"#AB725F",4:"#AB725F",5:"#AC725F",6:"#A9735F",7:"#A9735F",8:"#A9735F",9:"#A9735F",
  10:"#2D8B82",11:"#2E8B83",12:"#2D8B82",13:"#2D8B82",14:"#2D8B83",15:"#2D8B82",16:"#2D8B82",17:"#2D8B82",18:"#2D8B82",19:"#2D8B82",
  20:"#2D8B83",21:"#2D8B83",22:"#2D8B83",23:"#2D8B83",24:"#2D8B83",25:"#2D8B83",26:"#2D8B83",27:"#2D8B83",28:"#2D8B83",29:"#2D8B83",
  30:"#2F8D84",31:"#2F8D85",32:"#2F8D84",33:"#2F8D84",34:"#2F8D85",35:"#2F8D84",36:"#2F8D84",37:"#2F8D84",38:"#2F8D84",39:"#2F8D84",
  40:"#2F8D85",41:"#2F8D85",42:"#2F8D85",43:"#2F8D85",44:"#2F8D85",45:"#2F8D85",46:"#2F8D85",47:"#2F8D85",48:"#2F8D85",49:"#2F8D85",
  50:"#43308B",51:"#43318B",52:"#42308B",53:"#43308B",54:"#43318B",55:"#42308B",56:"#43308B",57:"#43308B",58:"#43308B",59:"#43308B",
  60:"#43308B",61:"#43318B",62:"#43308B",63:"#43308B",64:"#43318B",65:"#43308B",66:"#43318B",67:"#43318B",68:"#43308B",69:"#43308B",
  70:"#43308C",71:"#43318C",72:"#43308C",73:"#43318C",74:"#43318C",75:"#43308C",76:"#43318C",77:"#43318C",78:"#43308C",79:"#43318C",
};

export function getLevelColor(kind: 'rich' | 'charm', level: number): string {
  const map = kind === 'rich' ? RICH_COLORS : CHARM_COLORS;
  if (map[level]) return map[level];
  // find nearest lower defined level
  for (let l = level; l >= 0; l--) if (map[l]) return map[l];
  // else nearest higher
  for (let l = level; l <= 100; l++) if (map[l]) return map[l];
  return '#7B4FFF';
}

type ActiveTab = 'rich' | 'charm';

// ── Theme ─────────────────────────────────────────────────────────────────────

const TAB_THEMES = {
  rich: {
    gradient: ['#0d0d2e', '#1a1a4e', '#0d0d2e'] as [string, string, string],
    cardGradient: ['#1e1e50', '#12124a'] as [string, string],
    accent: '#7B4FFF',
    accentLight: '#9D7FFF',
    tabLabel: 'Rich Level',
    description: 'The rich level is counted by the coins you had recharged',
  },
  charm: {
    gradient: ['#2a0a1e', '#5c1a3e', '#2a0a1e'] as [string, string, string],
    cardGradient: ['#5c1a3e', '#2a0a1e'] as [string, string],
    accent: '#D946A8',
    accentLight: '#F472CC',
    tabLabel: 'Charm Level',
    description: 'The charm level is calculated based on the numbers of coins you received',
  },
} as const;

// ── LevelScreen ───────────────────────────────────────────────────────────────

export function LevelScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const targetUserId = route.params?.userId ?? authUser?.id;
  const isOwnProfile = !route.params?.userId || route.params.userId === authUser?.id;

  const [activeTab, setActiveTab] = useState<ActiveTab>('rich');

  const levelQuery = useUserLevelQuery(targetUserId, { isOwn: isOwnProfile });
  const tiersQuery = useLevelTiersQuery();

  useFocusEffect(
    useCallback(() => {
      void levelQuery.refetch();
      void tiersQuery.refetch();
    }, [levelQuery, tiersQuery]),
  );

  const levelInfo = levelQuery.data ?? null;
  const richTiers = tiersQuery.data?.tiers ?? [];
  const charmTiers = tiersQuery.data?.charmTiers ?? [];
  const loading = levelQuery.isLoading || tiersQuery.isLoading;
  const error = levelQuery.isError || tiersQuery.isError;

  const theme = TAB_THEMES[activeTab];
  const currentLevel = levelInfo
    ? (activeTab === 'rich' ? levelInfo.richLevel : levelInfo.charmLevel)
    : 0;
  const currentXp = levelInfo
    ? (activeTab === 'rich' ? levelInfo.richXp : levelInfo.charmXp)
    : 0;
  const nextThreshold = levelInfo
    ? (activeTab === 'rich' ? levelInfo.richNextThreshold : levelInfo.charmNextThreshold)
    : null;
  return (
    <LinearGradient colors={theme.gradient} style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={"#FFFFFF"} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Level</Text>
        <View style={styles.backBtn} />
      </View>

      {/* ── Tab switcher ── */}
      <View style={styles.tabs}>
        {(['rich', 'charm'] as ActiveTab[]).map((tab) => (
          <TouchableOpacity key={tab} style={styles.tabItem} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {TAB_THEMES[tab].tabLabel}
            </Text>
            {activeTab === tab && <View style={[styles.tabUnderline, { backgroundColor: theme.accent }]} />}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <LevelSkeleton />
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorText}>Failed to load levels</Text>
        </View>
      ) : (
        <FlatList
          data={activeTab === 'rich' ? richTiers : charmTiers}
          keyExtractor={(t) => t.label}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
          ListHeaderComponent={
            <>
              {/* ── User card ── */}
              <LinearGradient colors={theme.cardGradient} style={styles.userCard}>
                {/* Top row: avatar + name + hero icon */}
                <View style={styles.cardTopRow}>
                  <View style={styles.userInfo}>
                    <View style={styles.avatarRow}>
                      <UserAvatar
                        user={{
                          displayName: authUser?.displayName ?? 'User',
                          avatar: authUser?.avatar ?? null,
                          equippedFrame: authUser?.equippedFrame ?? null,
                        }}
                        size={56}
                      />
                      <View style={styles.nameCol}>
                        <Text style={styles.userName}>{authUser?.displayName ?? 'User'}</Text>
                        <View style={[styles.levelBadge, { backgroundColor: theme.accent }]}>
                          <Text style={styles.levelBadgeText}>Level {currentLevel}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  {activeTab === 'rich' ? (
                    <RichLevelBadge level={currentLevel} size={36} />
                  ) : (
                    <CharmLevelBadge level={currentLevel} size={36} />
                  )}
                </View>

                {/* Divider */}
                <View style={styles.divider} />

                {/* Upgrade text */}
                <Text style={styles.upgradeText}>
                  Level {currentLevel} upgrade requires{' '}
                  <Text style={[styles.upgradeCoins, { color: theme.accentLight }]}>
                    {nextThreshold != null
                      ? `${(nextThreshold - currentXp).toLocaleString()} coins`
                      : 'Max level reached'}
                  </Text>
                </Text>

                {/* Recharge button — Rich tab only */}
                {activeTab === 'rich' && (
                  <TouchableOpacity
                    style={[styles.rechargeBtn, { backgroundColor: theme.accent }]}
                    onPress={() => navigation.navigate('TopUp')}
                  >
                    <Text style={styles.rechargeBtnText}>Recharge</Text>
                  </TouchableOpacity>
                )}
              </LinearGradient>

              {/* ── Level description ── */}
              <View style={styles.levelLabelSection}>
                <Text style={styles.levelLabelDesc}>{theme.description}</Text>
              </View>
            </>
          }
          renderItem={({ item }) => (
            <TierRow
              tier={item}
              currentLevel={currentLevel}
              activeTab={activeTab}
              accentColor={theme.accent}
            />
          )}
        />
      )}
    </LinearGradient>
  );
}

// ── Tier Row ──────────────────────────────────────────────────────────────────

function TierRow({
  tier,
  currentLevel,
  activeTab,
  accentColor,
}: {
  tier: LevelTierInfo;
  currentLevel: number;
  activeTab: ActiveTab;
  accentColor: string;
}) {
  const isActive = currentLevel >= tier.minLevel && currentLevel <= tier.maxLevel;

  return (
    <View style={[styles.tierRow, isActive && { borderColor: accentColor, borderWidth: 1 }]}>
      <View style={styles.tierTextCol}>
        <View style={styles.tierLabelRow}>
          <Text style={styles.tierLabel}>{tier.label}</Text>
          {isActive && (
            <View style={[styles.myLevelBadge, { backgroundColor: accentColor }]}>
              <Text style={styles.myLevelText}>LV.{currentLevel}</Text>
            </View>
          )}
        </View>
        <Text style={styles.tierCoins}>{tier.coinsRange} Coins</Text>
      </View>
      {activeTab === 'rich' ? (
        <RichLevelBadge level={tier.iconLevel} label={tier.iconLevel} size={26} />
      ) : (
        <CharmLevelBadge level={tier.iconLevel} label={tier.iconLevel} size={26} />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: Spacing.lg,
  },
  tabItem: {
    marginRight: Spacing.xl,
    paddingBottom: Spacing.sm,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },

  listContent: {
    paddingHorizontal: Spacing.lg,
  },

  // User card
  userCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfo: {
    flex: 1,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameCol: {
    gap: Spacing.xs,
  },
  userName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: '700',
  },
  levelBadge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  heroIcon: {
    width: 90,
    height: 90,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  upgradeText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  upgradeCoins: {
    fontWeight: '700',
  },
  rechargeBtn: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  rechargeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Level Label section
  levelLabelSection: {
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  levelLabelTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: '700',
  },
  levelLabelDesc: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 19,
  },

  // Tier rows
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tierTextCol: {
    gap: 3,
    flex: 1,
  },
  tierLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  myLevelBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  myLevelText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  tierLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: '600',
  },
  tierCoins: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  tierIcon: {
    width: 44,
    height: 44,
  },
});
