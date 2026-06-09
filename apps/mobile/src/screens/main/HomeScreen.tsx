import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import type { RootState } from '@store/index';
import { canAccessLevelTask } from '@/utils/levelTaskEligibility';
import { useRefetchOnFocusIfStale } from '@hooks/useRefetchOnFocusIfStale';
import { useRoomsListQuery } from '@hooks/queries/useRoomsListQuery';
import { prefetchRoomDetail } from '@api/prefetch';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Colors, Spacing, Radius } from '@/theme';
import { mainTabContentPaddingBottom } from '../../constants/layout';
import { useLayout } from '@hooks/useLayout';
import { CardGridSkeleton } from '@components/Skeleton';
import { RegionalRankBadge } from '@components/RegionalRankBadge';
import type { Room } from '@/types';
import type { RootStackParamList, MainTabParamList } from '@navigation/types';
// ── Types ─────────────────────────────────────────────────────────────────────

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;
type HomeTab = 'nearby' | 'follow' | 'live' | 'new';
type FeedRow =
  | { type: 'rooms'; rooms: Room[]; id: string }
  | { type: 'banner'; id: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: HomeTab; label: string }[] = [
  { key: 'nearby', label: 'Nearby' },
  { key: 'follow', label: 'Follow' },
  { key: 'live',   label: 'Live'   },
  { key: 'new',    label: 'Party'  },
];

type Category =
  | { id: string; kind: 'icon';  icon: number; colors: [string, string] }
  | { id: string; kind: 'image'; image: number };

const CATEGORIES: Category[] = [
  { id: 'all',  kind: 'icon', icon: require('../../../assets/home/categories/all.png'),  colors: ['#FA9634', '#FF3367'] },
  { id: 'chat', kind: 'icon', icon: require('../../../assets/home/categories/chat.png'), colors: ['#F4B2CE', '#FF8FD9'] },
];

const ACTIVITIES: {
  id: string;
  label: string;
  subtitle: string;
  image: number;
  colors: [string, string];
}[] = [
  { id: 'join_call', label: 'Join Call', subtitle: 'Party', image: require('../../../assets/home/join_call.png'), colors: ['#AB5DE7', '#4D25FE'] },
  { id: 'reward',    label: 'Reward',    subtitle: 'Task',  image: require('../../../assets/home/reward.png'),    colors: ['#16DD80', '#095F37'] },
  { id: 'game',      label: 'Game',      subtitle: 'Game',  image: require('../../../assets/home/game.png'),      colors: ['#FE8B5F', '#FF2F55'] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFeed(rooms: Room[]): FeedRow[] {
  const rows: FeedRow[] = [];
  for (let i = 0; i < rooms.length; i += 2) {
    rows.push({ type: 'rooms', rooms: rooms.slice(i, i + 2), id: `row-${i}` });
    if (i === 2) rows.push({ type: 'banner', id: 'topic-event' });
  }
  return rows;
}

// ── HomeScreen ─────────────────────────────────────────────────────────────────

export function HomeScreen() {
  const authUser = useSelector((s: RootState) => s.auth.user);
  const isFemaleHost = canAccessLevelTask(authUser);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { contentWidth, clamp } = useLayout();
  const [activeTab, setActiveTab] = useState<HomeTab>('live');
  const [activeCategory, setActiveCategory] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);

  const queryParams = useMemo(() => {
    if (activeTab === 'follow') return { following: true as const };
    if (activeTab === 'new') return { newest: true as const };
    if (activeTab === 'nearby') return { nearby: true as const };
    if (activeCategory === 'chat') return { roomMode: 'chat' as const };
    return {};
  }, [activeTab, activeCategory]);

  const nearbyEnabled = activeTab !== 'nearby' || locationGranted === true;
  const { data: rooms = [], isLoading: loading, isStale, refetch } = useRoomsListQuery(
    queryParams,
    { enabled: nearbyEnabled },
  );

  // ── Responsive dimensions ──────────────────────────────────────────────────
  // Cards: 2 per row, with gap between them
  const cardGap = Spacing.sm;
  const cardWidth = (contentWidth - cardGap) / 2;
  const cardHeight = clamp(Math.round(cardWidth * (169 / 185)), 120, 220);

  // Activity row: three equal cards, full content width, centered as a group on wide screens
  const activityGap = Spacing.sm;
  const activityInnerWidth = contentWidth;
  const activityCardWidth = clamp(
    Math.floor((activityInnerWidth - 2 * activityGap) / 3),
    88,
    160,
  );
  const activityCardHeight = clamp(Math.round(activityCardWidth * (72 / 112)), 52, 96);

  // Topic event banner height
  const bannerHeight = clamp(Math.round(contentWidth * 0.27), 80, 140);

  // ── Location helpers ────────────────────────────────────────────────────────
  const locationSent = useRef(false);

  const requestLocationAndUpdate = useCallback(async (): Promise<boolean> => {
    const { status: existing } = await Location.getForegroundPermissionsAsync();
    if (existing === 'granted') {
      locationSent.current = true;
      setLocationGranted(true);
      return true;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      locationSent.current = true;
      setLocationGranted(true);
      return true;
    }

    setLocationGranted(false);
    return false;
  }, []);

  // Check location permission when switching to Nearby tab
  useEffect(() => {
    if (activeTab === 'nearby') {
      (async () => {
        const { status } = await Location.getForegroundPermissionsAsync();
        setLocationGranted(status === 'granted');
      })();
    } else {
      setLocationGranted(null);
    }
  }, [activeTab]);

  // ── Focus-based refetch (skips if data is still fresh) ────────────────────
  useRefetchOnFocusIfStale(refetch, isStale, nearbyEnabled);

  const handleJoinRoom = useCallback(
    async (room: Room) => {
      try {
        // Warm the room detail during the navigation animation so RoomScreen
        // paints without a network wait.
        prefetchRoomDetail(room.id);
        navigation.navigate('RoomModal', {
          roomId: room.id,
          roomMode: room.roomMode ?? 'chat',
          isLocked: room.isLocked,
          hostId: room.hostId,
        });
      } catch (e: unknown) {
        Alert.alert('Cannot Join', e instanceof Error ? e.message : 'Failed to join room');
      }
    },
    [navigation],
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);

  const feedData = buildFeed(rooms);

  // ── Reusable header ────────────────────────────────────────────────────────
  const ListHeader = (
    <>
      {/* Tab row */}
      <View style={styles.tabRow}>
        <View style={styles.tabList}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={styles.tabItem}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {activeTab === tab.key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tabActions}>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Search')}>
            <Image
              source={require('../../../assets/home/search.png')}
              style={styles.searchIcon}
              contentFit="contain"
            />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Ranking', {})}>
            <Image
              source={require('../../../assets/home/Rank.png')}
              style={styles.rankIcon}
              contentFit="contain"
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.allLink} hitSlop={8}>
            <Text style={styles.allLinkText}>All</Text>
            <Ionicons name="chevron-down" size={14} color="#FF2D55" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category filter chips — Live tab only */}
      {activeTab === 'live' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {CATEGORIES.map((cat) => {
            if (cat.kind === 'icon') {
              return (
                <TouchableOpacity key={cat.id} onPress={() => setActiveCategory(cat.id)} activeOpacity={0.85}>
                  <LinearGradient
                    colors={cat.colors}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0, y: 0 }}
                    style={styles.categoryPill}
                  >
                    <Image source={cat.icon} style={styles.categoryPillIcon} contentFit="contain" />
                  </LinearGradient>
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity key={cat.id} activeOpacity={0.85}>
                <Image source={cat.image} style={styles.categoryPillImage} contentFit="cover" />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Activity cards — Live tab only */}
      {activeTab === 'live' && (
        <View style={styles.activityRow}>
          {ACTIVITIES.map((activity) => (
            <TouchableOpacity
              key={activity.id}
              activeOpacity={0.85}
              onPress={() => {
                if (activity.id === 'reward') {
                  navigation.navigate(isFemaleHost ? 'FemaleHostTask' : 'NewLevelTask');
                }
              }}
            >
              <LinearGradient
                colors={activity.colors}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 0 }}
                style={[
                  styles.activityCard,
                  { width: activityCardWidth, height: activityCardHeight },
                ]}
              >
                <Text
                  style={[styles.activityLabel, { fontSize: clamp(Math.round(activityCardWidth * 0.125), 11, 14) }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {activity.label}
                </Text>

                {/* Play-arrow chevrons + faded subtitle overlay (behind icon) */}
                <View style={styles.activityOverlay} pointerEvents="none">
                  <View style={styles.activityArrowRow}>
                    <Ionicons name="play" size={9} color="rgba(255,255,255,0.95)" />
                    <Ionicons name="play" size={9} color="rgba(255,255,255,0.6)" style={{ marginLeft: -3 }} />
                    <Ionicons name="play" size={9} color="rgba(255,255,255,0.35)" style={{ marginLeft: -3 }} />
                  </View>
                  <Text
                    style={[
                      styles.activitySubtitle,
                      { fontSize: clamp(Math.round(activityCardHeight * 0.38), 18, 28) },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {activity.subtitle}
                  </Text>
                </View>

                <Image
                  source={activity.image}
                  style={[styles.activityIcon, { width: activityCardHeight * 0.75, height: activityCardHeight * 0.75 }]}
                  contentFit="contain"
                />
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Nearby location hint */}
      {activeTab === 'nearby' && locationGranted && (
        <View style={styles.nearbyBanner}>
          <Ionicons name="location-outline" size={16} color={Colors.textTertiary} />
          <Text style={styles.nearbyText}>Showing rooms near you</Text>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.screen}>
      {/* Top decorative gradient background (with corner icons baked in) */}
      <Image
        source={require('../../../assets/home/top_gradient.png')}
        style={styles.headerGradient}
        contentFit="cover"
        contentPosition="top"
      />
      <View style={[styles.flex, { paddingTop: insets.top }]}>
      {activeTab === 'nearby' && locationGranted === false ? (
        <ScrollView
          contentContainerStyle={styles.gpsContainer}
          showsVerticalScrollIndicator={false}
        >
          {ListHeader}
          <View style={styles.gpsContent}>
            <Image
              source={require('../../../assets/empty/turn_on_gps.png')}
              style={styles.gpsImage}
              contentFit="contain"
            />
            <Text style={styles.gpsText}>Turn on GPS</Text>
            <TouchableOpacity
              style={styles.gpsButton}
              activeOpacity={0.7}
              onPress={() => void requestLocationAndUpdate()}
            >
              <Ionicons name="location" size={18} color="#FFFFFF" />
              <Text style={styles.gpsButtonText}>Enable Location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Linking.openSettings()}
              activeOpacity={0.7}
            >
              <Text style={styles.gpsSettingsText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : loading ? (
        <View style={styles.flex}>
          {ListHeader}
          <CardGridSkeleton rows={3} cardWidth={cardWidth} cardHeight={cardHeight} />
        </View>
      ) : (
        <FlatList
          data={feedData}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={ListHeader}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: mainTabContentPaddingBottom(insets, Spacing.xxxl) },
          ]}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => {
            if (item.type === 'banner') {
              return (
                <TopicEventBanner
                  contentWidth={contentWidth}
                  height={bannerHeight}
                />
              );
            }
            return (
              <View style={styles.roomRow}>
                {item.rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    width={cardWidth}
                    height={cardHeight}
                    onPress={() => handleJoinRoom(room)}
                  />
                ))}
                {item.rooms.length < 2 && (
                  <View style={{ width: cardWidth }} />
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            activeTab === 'follow' ? (
              <View style={styles.empty}>
                <Image
                  source={require('../../../assets/empty/following.png')}
                  style={styles.followEmptyImage}
                  contentFit="contain"
                />
                <Text style={styles.emptyTitle}>
                  The host you followed hasn't started live
                </Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="radio-outline" size={52} color={Colors.textTertiary} />
                <Text style={styles.emptyTitle}>No Live Rooms</Text>
                <Text style={styles.emptyBody}>Be the first to go live!</Text>
              </View>
            )
          }
        />
      )}

      {/* Go Live FAB */}
      <TouchableOpacity
        style={[styles.goLiveFab, { bottom: 86 + insets.bottom + Spacing.md }]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('Live')}
      >
        <Image
          source={require('../../../assets/tab-icons/tab_live.png')}
          style={styles.goLiveFabIcon}
          contentFit="contain"
          tintColor="#FF2E66"
        />
      </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Room Card ─────────────────────────────────────────────────────────────────

const RoomCard = React.memo(function RoomCard({
  room,
  width,
  height,
  onPress,
}: {
  room: Room;
  width: number;
  height: number;
  onPress: () => void;
}) {
  if (!room.host) return null;
  const locationLabel =
    room.host.city?.trim() ||
    room.host.country?.trim() ||
    '—';

  return (
    <TouchableOpacity
      style={[styles.roomCard, { width, height }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      {room.coverImage ? (
        <Image
          source={{ uri: room.coverImage }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : room.host.avatar ? (
        <Image
          source={{ uri: room.host.avatar }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <LinearGradient colors={['#7B4FFF', '#5B2FD4']} style={StyleSheet.absoluteFill} />
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={styles.roomCardOverlay}
      />

      {/* Regional earner rank (daily, city shard) */}
      {room.hostRegionalEarnerBadge ? (
        <RegionalRankBadge
          label={room.hostRegionalEarnerBadge.label}
          rank={room.hostRegionalEarnerBadge.rank}
          style={styles.regionalBadge}
        />
      ) : null}

      {/* Bottom info */}
      <View style={styles.roomCardBottom}>
        <View style={styles.infoPillRow}>
          <View style={styles.infoPill}>
            <Ionicons name="location" size={11} color="#FFFFFF" />
            <Text style={styles.infoPillText} numberOfLines={1}>
              {locationLabel}
            </Text>
          </View>
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText} numberOfLines={1}>
              {room.type === 'private' ? 'Private' : 'Chatting'}
            </Text>
          </View>
        </View>
        <View style={styles.roomCardMeta}>
          <Text style={styles.hostName} numberOfLines={1}>
            {room.host.displayName}
          </Text>
          <View style={styles.coinRow}>
            <Ionicons name="flame" size={11} color="#FF9800" />
            <Text style={styles.coinText}>{room.viewerCount}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── Topic Event Banner ─────────────────────────────────────────────────────────

const TopicEventBanner = React.memo(function TopicEventBanner({
  contentWidth,
  height,
}: {
  contentWidth: number;
  height: number;
}) {
  return (
    <View style={styles.topicBannerWrap}>
      <LinearGradient
        colors={['#7B4FFF', '#FF2D55']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.topicBannerGradient, { height }]}
      >
        <Text
          style={[styles.topicBannerText, { fontSize: Math.round(height * 0.36) }]}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          TOPIC EVENT
        </Text>
      </LinearGradient>
    </View>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },

  // ── Top decorative gradient (behind tab row + chips) — fills from screen y=0
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 320,
  },

  // ── Tab row
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  tabList: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.md,
  },
  tabItem: {
    paddingBottom: Spacing.xs,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(0,0,0,0.45)',
  },
  tabTextActive: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '30%',
    right: '30%',
    height: 3,
    backgroundColor: '#FF2D55',
    borderRadius: 2,
  },
  tabActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,45,85,0.5)',
    borderWidth: 1,
    borderColor: '#FFCC00',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  rankCrown: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,45,85,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  searchIcon: {
    width: 20,
    height: 20,
  },
  rankIcon: {
    width: 44,
    height: 22,
  },
  allLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  allLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF2D55',
  },

  // ── Category chips (56x30 pills per design spec)
  categoryRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: 10,
    alignItems: 'center',
  },
  categoryPill: {
    width: 56,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  categoryPillIcon: {
    width: 24,
    height: 24,
  },
  categoryPillImage: {
    width: 56,
    height: 30,
    borderRadius: 15,
  },

  // ── Activity cards (three equal columns, centered on wide screens when width hits max)
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  activityCard: {
    borderRadius: Radius.md,
    padding: Spacing.xs,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  activityLabel: {
    color: '#FFFFFF',
    fontWeight: '400',
    paddingLeft: 2,
    paddingTop: 3,
  },
  activityIcon: {
    alignSelf: 'flex-end',
  },
  activityOverlay: {
    position: 'absolute',
    left: 7,
    bottom: 4,
  },
  activityArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
  },
  activitySubtitle: {
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.22)',
    marginTop: -4,
  },

  // ── Nearby banner
  nearbyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  nearbyText: {
    color: Colors.textTertiary,
    fontSize: 14,
  },

  // ── GPS empty state
  gpsContainer: {
    flexGrow: 1,
  },
  gpsContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
  },
  gpsImage: {
    width: 200,
    height: 200,
  },
  gpsText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    marginTop: Spacing.lg,
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    marginTop: Spacing.xl,
  },
  gpsButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  gpsSettingsText: {
    fontSize: 13,
    fontWeight: '400',
    color: Colors.textTertiary,
    marginTop: Spacing.md,
    textDecorationLine: 'underline',
  },

  // ── Feed list
  listContent: {},

  // ── Room rows
  roomRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // ── Room card — width/height passed as inline style
  roomCard: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
  },
  roomCardOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  regionalBadge: {
    position: 'absolute',
    top: Spacing.xs,
    left: Spacing.xs,
    zIndex: 1,
  },
  roomCardBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.xs,
    gap: 3,
  },
  infoPillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  infoPillText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  roomCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 3,
  },
  hostName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  coinText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ── Topic Event banner — width/height passed as inline style
  topicBannerWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  topicBannerGradient: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicBannerText: {
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#FFFFFF',
    letterSpacing: 2,
  },

  // ── Go Live FAB
  goLiveFab: {
    position: 'absolute',
    right: Spacing.lg,
    width: 53,
    height: 53,
    borderRadius: 26.5,
    backgroundColor: '#FDE1E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goLiveFabIcon: {
    width: 28,
    height: 28,
  },

  // ── Empty state
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: 17,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  emptyBody: {
    color: Colors.textTertiary,
    fontSize: 13,
  },
  followEmptyImage: {
    width: 200,
    height: 200,
  },
});
