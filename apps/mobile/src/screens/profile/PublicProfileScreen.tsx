import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CopyableId } from '@components/CopyableId';
import { CopyIcon } from '@components/CopyIcon';
import { StoreItemMedia } from '@components/StoreItemMedia';
import { CosmeticBackground } from '@components/CosmeticBackground';
import { UserAvatar, AVATAR_FRAME_SCALE } from '@components/UserAvatar';
import { UserIdBadge } from '@components/UserIdBadge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootStackScreenProps } from '@navigation/types';
import { usersApi } from '@api/users';
import type { RootState } from '../../store';
import { momentsApi } from '@api/moments';
import { startVideoCall } from '@/utils/videoCall';
import type { FanEntry } from '@api/leaderboard';
import {
  usePublicProfileQuery,
  useProfileGiftsQuery,
  useProfileFansQuery,
  setCachedPublicProfile,
} from '@hooks/queries/useProfileQueries';
import {
  useUserLevelQuery,
  syncProfileLevelCache,
} from '@hooks/queries/useLevelQueries';
import type { MomentPost } from '@/types';

type ReceivedGift = { id: string; name: string; icon: string; image: string | null; receivedAt: string };
import { Colors, Radius, Spacing } from '@/theme';
import { ProfileSkeleton } from '@components/Skeleton';
import { charmLevelBg } from '../level/charmLevelBg';
import { charmLevelIcon } from '../level/charmLevelIcon';
import { richLevelBg } from '../level/richLevelBg';
import { richLevelIcon } from '../level/richLevelIcon';
import type { PublicUser } from '@/types';
import { TagBadges } from '@components/TagBadges';
import { AgencyRoleBadge, LegacyRibbonBadge, RoleTagImage } from '@components/RoleTagImage';
import { ROLE_TAG_BADGE_HEIGHT } from '@components/tagBadgeAssets';
import {
  getGenderPillBackground,
  getGenderSymbol,
} from '@/utils/genderDisplay';

type Props = RootStackScreenProps<'PublicProfile'>;

const { width: SCREEN_W } = Dimensions.get('window');
const LEVEL_CARD_GAP = Spacing.sm;
/** Fixed card size from level-bg art (360×156); not stretched to fill the row. */
const LEVEL_CARD_WIDTH = 152;
const LEVEL_CARD_HEIGHT = Math.round(LEVEL_CARD_WIDTH * (156 / 360));
const HERO_HEIGHT = SCREEN_W * 0.95;
const HERO_AVATAR_SIZE = 72;
const HERO_AVATAR_FRAME_SIZE = Math.round(HERO_AVATAR_SIZE * AVATAR_FRAME_SCALE);

function frameIdentityTopInset(hasFrame: boolean): number {
  const base = Spacing.lg + 6;
  if (!hasFrame) return base;
  const frameOffset = Math.round((HERO_AVATAR_SIZE * AVATAR_FRAME_SCALE - HERO_AVATAR_SIZE) / 2);
  return base + frameOffset;
}

type ProfileTab = 'data' | 'moments';

interface ActiveRoom {
  id: string;
  thumbnail?: string;
  title?: string;
  startedAgoText?: string;
  hostId?: string;
  isLocked?: boolean;
  roomMode?: 'chat' | 'live';
}

export function PublicProfileScreen({ route, navigation }: Props) {
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const profileVersion = useSelector((state: RootState) => state.profile.profileVersion);
  const isOwnProfile = authUser?.id === userId;

  const profileQuery = usePublicProfileQuery(userId);
  const levelQuery = useUserLevelQuery(userId, { isOwn: isOwnProfile });
  const giftsQuery = useProfileGiftsQuery(userId, 16);
  const fansQuery = useProfileFansQuery(userId);

  // Local mirror of the cached profile so optimistic follow/edit logic can
  // mutate it directly; seeded instantly from cache on a revisit (no skeleton).
  const [user, setUser] = useState<PublicUser | null>(profileQuery.data ?? null);
  useEffect(() => {
    if (profileQuery.data) setUser(profileQuery.data);
  }, [profileQuery.data]);

  useEffect(() => {
    if (!levelQuery.data) return;
    syncProfileLevelCache(userId, levelQuery.data);
    setUser((prev) => {
      if (!prev) return prev;
      if (
        prev.richLevel === levelQuery.data!.richLevel &&
        prev.charmLevel === levelQuery.data!.charmLevel
      ) {
        return prev;
      }
      return {
        ...prev,
        richLevel: levelQuery.data!.richLevel,
        charmLevel: levelQuery.data!.charmLevel,
      };
    });
  }, [levelQuery.data, userId]);

  const loading = !user && profileQuery.isLoading;

  const [followLoading, setFollowLoading] = useState(false);
  const [tab, setTab] = useState<ProfileTab>('data');
  const [moments, setMoments] = useState<MomentPost[] | null>(null);
  const [momentsLoading, setMomentsLoading] = useState(false);
  const giftGallery: ReceivedGift[] = giftsQuery.data ?? [];

  useFocusEffect(
    useCallback(() => {
      void levelQuery.refetch();
      if (isOwnProfile) {
        void profileQuery.refetch();
        return;
      }
      if (!authUser || !user) return;
      usersApi.logVisit(userId).catch(() => {});
    }, [authUser, isOwnProfile, user, userId, profileQuery, levelQuery]),
  );

  useEffect(() => {
    if (!isOwnProfile || profileVersion === 0) return;
    void profileQuery.refetch();
  }, [isOwnProfile, profileVersion, profileQuery]);

  const openSupporterList = useCallback(() => {
    if (!user) return;
    navigation.navigate('SupporterList', { userId, displayName: user.displayName });
  }, [navigation, user, userId]);

  useEffect(() => {
    if (tab !== 'moments' || moments !== null) return;
    setMomentsLoading(true);
    momentsApi.listByUser(userId)
      .then((feed) => setMoments(feed.results))
      .catch(() => setMoments([]))
      .finally(() => setMomentsLoading(false));
  }, [tab, moments, userId]);

  const topSupporters: FanEntry[] = fansQuery.data ?? [];

  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const handleFollow = useCallback(async () => {
    if (!user || followLoading) return;
    const wasFollowing = user.isFollowing;
    setFollowLoading(true);
    const optimistic = (u: PublicUser): PublicUser => ({
      ...u,
      isFollowing: !wasFollowing,
      followerCount: u.followerCount + (wasFollowing ? -1 : 1),
    });
    const revert = (u: PublicUser): PublicUser => ({
      ...u,
      isFollowing: wasFollowing,
      followerCount: u.followerCount + (wasFollowing ? 1 : -1),
    });
    setUser((u) => u && optimistic(u));
    setCachedPublicProfile(userId, optimistic);
    try {
      if (wasFollowing) await usersApi.unfollow(userId);
      else await usersApi.follow(userId);
      void profileQuery.refetch();
      showToast(wasFollowing ? 'Unfollowed' : 'Followed');
    } catch (e: any) {
      setUser((u) => u && revert(u));
      setCachedPublicProfile(userId, revert);
      Alert.alert('Error', e?.message || (wasFollowing ? 'Failed to unfollow' : 'Failed to follow'));
    } finally {
      setFollowLoading(false);
    }
  }, [user, userId, followLoading, profileQuery]);

  const handleVideoChat = useCallback(() => {
    if (!user) return;
    void startVideoCall(userId, user.displayName);
  }, [user, userId]);

  const openEditProfile = useCallback(() => {
    const root = navigation.getParent();
    if (root) {
      (root as { navigate: (name: 'EditProfile') => void }).navigate('EditProfile');
      return;
    }
    navigation.navigate('EditProfile');
  }, [navigation]);

  const handleShare = useCallback(async () => {
    if (!user) return;
    try {
      await Share.share({ message: `Check out ${user.displayName} on Haka Live` });
    } catch {}
  }, [user]);

  if (loading || !user) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <ProfileSkeleton />
      </View>
    );
  }

  const u = user as PublicUser & {
    isVerified?: boolean;
    gender?: 'male' | 'female' | string;
    richLevel?: number;
    charmLevel?: number;
    monthlySent?: number;
    monthlyReceived?: number;
    momentsCount?: number;
    badges?: string[];
    activeRoom?: ActiveRoom | null;
  };

  const displayName = u.displayName || u.username || '';
  const richLevel = levelQuery.data?.richLevel ?? u.richLevel ?? 0;
  const charmLevel = levelQuery.data?.charmLevel ?? u.charmLevel ?? 0;
  // Level cards show the user's rolling 30-day gift activity instead of
  // coins-to-next-level: Rich = coins sent, Charm = beans received. Both come
  // from the /users/:id payload (monthlySent = Σ coinCost, monthlyReceived = Σ beanValue).
  const richMeta = `Monthly sent: ${formatCount(u.monthlySent ?? 0)}`;
  const charmMeta = `Monthly received: ${formatCount(u.monthlyReceived ?? 0)}`;
  const momentsCount = u.momentsCount ?? 0;
  const isVerified = u.isVerified ?? false;
  const activeRoom = u.activeRoom ?? null;
  const giftSlots = 16;
  const displayGender = isOwnProfile ? (authUser?.gender ?? u.gender) : u.gender;
  const genderIcon = getGenderSymbol(displayGender);
  const genderPillBg = getGenderPillBackground(displayGender);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      >
        {/* ── Hero photo ── */}
        <View style={[styles.hero, { height: HERO_HEIGHT }]}>
          {u.equippedDynamicProfile?.image ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <StoreItemMedia
                source={u.equippedDynamicProfile.image}
                size={Math.round(HERO_HEIGHT)}
                fillContainer
                replayOnFocus
              />
            </View>
          ) : u.avatar ? (
            <Image source={{ uri: u.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <LinearGradient colors={['#7B4FFF', '#5B2FD4']} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.15)']}
            locations={[0, 0.3, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={[styles.heroTopBar, { paddingTop: insets.top + 6 }]}>
            <TouchableOpacity style={styles.heroIconBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            {isOwnProfile ? (
              <TouchableOpacity style={styles.heroIconBtn} onPress={openEditProfile}>
                <Ionicons name="create-outline" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.heroIconBtn} onPress={handleShare}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Active room floating card */}
          {activeRoom && (
            <TouchableOpacity
              style={styles.partyCard}
              activeOpacity={0.85}
              onPress={() =>
                navigation.navigate('RoomModal', {
                  roomId: activeRoom.id,
                  roomMode: activeRoom.roomMode ?? 'chat',
                  isLocked: activeRoom.isLocked,
                  hostId: activeRoom.hostId,
                })
              }
            >
              {activeRoom.thumbnail ? (
                <Image source={{ uri: activeRoom.thumbnail }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              ) : (
                <LinearGradient
                  colors={['#FF6B8A', '#C44CE0']}
                  style={StyleSheet.absoluteFillObject}
                />
              )}
              <View style={styles.partyOverlay} />
              <View style={styles.partyLabel}>
                <Text style={styles.partyLabelText}>PARTY</Text>
              </View>
              <View style={styles.partyMicBadge}>
                <Ionicons name="mic" size={14} color="#FFFFFF" />
              </View>
              <Text style={styles.partyTime}>{activeRoom.startedAgoText ?? 'Live now'}</Text>
            </TouchableOpacity>
          )}

          {/* Mini avatar bottom-left */}
          <View style={styles.heroAvatarMini}>
            <UserAvatar
              user={{
                displayName,
                avatar: u.avatar,
                equippedFrame: u.equippedFrame ?? null,
                equippedRing: u.equippedRing ?? null,
              }}
              size={HERO_AVATAR_SIZE}
              replayFrameOnFocus
            />
          </View>
        </View>

        {/* ── Identity row ── */}
        <CosmeticBackground
          source={u.equippedProfileCard?.image}
          style={styles.profileCardShell}
          contentStyle={styles.profileCardInner}
        >
        <View
          style={[
            styles.identitySection,
            { paddingTop: frameIdentityTopInset(Boolean(u.equippedFrame?.image)) },
          ]}
        >
          <View style={styles.nameRow}>
            <View style={styles.nameRowSide} />
            <View style={styles.nameRowCenter}>
              <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
              {isVerified && (
                <Ionicons name="checkmark-circle" size={16} color={Colors.info} style={{ marginLeft: 4 }} />
              )}
            </View>
            {!isOwnProfile ? (
              <TouchableOpacity
                style={[styles.favBtn, user.isFollowing && styles.favBtnActive]}
                onPress={handleFollow}
                disabled={followLoading}
              >
                <Ionicons
                  name={user.isFollowing ? 'person-remove' : 'person-add'}
                  size={18}
                  color={user.isFollowing ? '#1A1A1A' : '#FF6B9D'}
                />
              </TouchableOpacity>
            ) : (
              <View style={styles.nameRowSide} />
            )}
          </View>
          <View style={styles.metaRow}>
            {u.activeSpecialId ? (
              <>
                <UserIdBadge
                  hakaId={u.hakaId ?? null}
                  activeSpecialId={u.activeSpecialId}
                  activeSpecialIdLevel={u.activeSpecialIdLevel}
                  width={108}
                  height={24}
                  hidePlain
                />
                <TouchableOpacity
                  hitSlop={8}
                  style={styles.copySuper}
                  onPress={async () => {
                    await Clipboard.setStringAsync(u.activeSpecialId ?? u.hakaId ?? '');
                    if (Platform.OS === 'android') {
                      ToastAndroid.show('ID copied', ToastAndroid.SHORT);
                    } else {
                      Alert.alert('Copied', 'ID copied to clipboard');
                    }
                  }}
                >
                  <CopyIcon size={10} color="#AAAAAA" />
                </TouchableOpacity>
              </>
            ) : u.hakaId ? (
              <CopyableId value={u.activeSpecialId ?? u.hakaId} textStyle={styles.metaText} iconColor={Colors.textSecondary} />
            ) : null}
          </View>
          {/* Gender → flag → tags → role badges, all on one wrapping line */}
          <TagBadges
            tags={u.tags ?? []}
            size="sm"
            style={styles.profileTagsRow}
            leading={
              <>
                {genderIcon && (
                  <View style={[styles.genderPill, { backgroundColor: genderPillBg }]}>
                    <Text style={styles.genderIcon}>{genderIcon}</Text>
                    {typeof u.age === 'number' && u.age > 0 && (
                      <Text style={styles.genderIcon}> {u.age}</Text>
                    )}
                  </View>
                )}
                {u.country && u.country.length >= 2 ? (
                  <View style={styles.flagWrap}>
                    <Image
                      source={{ uri: `https://flagcdn.com/w80/${u.country.slice(0, 2).toLowerCase()}.png` }}
                      style={styles.flagIcon}
                      contentFit="cover"
                    />
                  </View>
                ) : null}
              </>
            }
            trailing={
              <>
                {u.role === 'host' && (
                  <RoleTagImage roleKey="coin_seller" tags={u.tags} height={ROLE_TAG_BADGE_HEIGHT} />
                )}
                {u.role === 'agent' && <AgencyRoleBadge height={ROLE_TAG_BADGE_HEIGHT} />}
                {u.role === 'super_admin' && (
                  <RoleTagImage roleKey="super_admin" tags={u.tags} height={ROLE_TAG_BADGE_HEIGHT} />
                )}
                {u.role === 'admin' && (
                  <RoleTagImage roleKey="admin" tags={u.tags} height={ROLE_TAG_BADGE_HEIGHT} />
                )}
                {(u.badges ?? []).slice(0, 3).map((b) => (
                  <LegacyRibbonBadge key={b} label={b} height={ROLE_TAG_BADGE_HEIGHT} />
                ))}
              </>
            }
          />
        </View>

        {/* ── Level cards ── */}
        <View style={styles.levelCardsSection}>
          <View style={styles.levelCardsRow}>
            <LevelCard
              bg="#3B3BB8"
              title="Rich"
              level={richLevel}
              meta={richMeta}
              icon={richLevelIcon(richLevel)}
              bgImage={richLevelBg(richLevel)}
              onPress={() => navigation.navigate('Level', { userId })}
            />
            <LevelCard
              bg="#E02C87"
              title="Charm"
              level={charmLevel}
              meta={charmMeta}
              icon={charmLevelIcon(charmLevel)}
              bgImage={charmLevelBg(charmLevel)}
              onPress={() => navigation.navigate('Level', { userId })}
            />
          </View>
        </View>

        {/* ── Follow / Followers ── */}
        <View style={styles.followRow}>
          <Text style={styles.followLabel}>
            Friends: <Text style={styles.followNum}>{u.friendCount ?? 0}</Text>
          </Text>
          <Text style={styles.followLabel}>
            Follow: <Text style={styles.followNum}>{u.followingCount}</Text>
          </Text>
          <Text style={styles.followLabel}>
            Followers: <Text style={styles.followNum}>{u.followerCount}</Text>
          </Text>
        </View>
        </CosmeticBackground>

        {/* ── Tabs ── */}
        <View style={styles.tabsRow}>
          <TabBtn label="Data" active={tab === 'data'} onPress={() => setTab('data')} />
          <TabBtn label={`Moments (${momentsCount})`} active={tab === 'moments'} onPress={() => setTab('moments')} />
        </View>

        {/* ── Tab content ── */}
        {tab === 'data' ? (
          <View style={styles.tabContent}>
            {/* Personal Information */}
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <View style={styles.bioBox}>
              {u.bio ? (
                <Text style={styles.bioText}>{u.bio}</Text>
              ) : (
                <Text style={styles.bioPlaceholder}>No personal information yet.</Text>
              )}
            </View>

            <SupporterPreviewSection supporters={topSupporters} onPress={openSupporterList} />

            {/* Gift Gallery */}
            <TouchableOpacity
              style={styles.sectionHeader}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('GiftGallery', { userId, displayName })}
            >
              <Text style={styles.sectionTitle}>Gift Gallery</Text>
              <View style={styles.sectionMeta}>
                <Text style={styles.sectionMetaText}>{giftGallery.length}/{giftSlots}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </View>
            </TouchableOpacity>
            <View style={styles.giftRow}>
              {Array.from({ length: 4 }, (_, i) => giftGallery[i]).map((g, i) => (
                <View key={i} style={styles.giftCell}>
                  {g?.image ? (
                    <Image source={{ uri: g.image }} style={styles.giftImg} contentFit="cover" />
                  ) : (
                    <Ionicons name="gift-outline" size={20} color={Colors.textTertiary} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ) : tab === 'moments' ? (
          <View style={styles.tabContent}>
            {momentsLoading ? (
              <View style={styles.emptyTab}>
                <Text style={styles.emptyTabText}>Loading…</Text>
              </View>
            ) : !moments || moments.length === 0 ? (
              <View style={styles.emptyTab}>
                <Ionicons name="images-outline" size={36} color={Colors.textTertiary} />
                <Text style={styles.emptyTabText}>No moments yet</Text>
              </View>
            ) : (
              <View style={styles.momentsGrid}>
                {moments.map((m) => (
                  <View key={m.id} style={styles.momentTile}>
                    {m.media_url ? (
                      <Image source={{ uri: m.media_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.momentTextTile]}>
                        <Text style={styles.momentCaptionText} numberOfLines={4}>{m.caption || '—'}</Text>
                      </View>
                    )}
                    {m.post_type === 'video' && (
                      <View style={styles.momentBadge}>
                        <Ionicons name="play" size={10} color="#FFF" />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* ── Bottom action bar ── */}
      {!isOwnProfile && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            style={styles.messageBtn}
            onPress={() =>
              navigation.navigate('DMConversation', {
                userId: user.id,
                displayName: user.displayName,
              })
            }
          >
            <Ionicons name="chatbubble-ellipses" size={18} color="#7B4FFF" />
            <Text style={styles.messageBtnText}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.videoChatBtn} onPress={handleVideoChat}>
            <Ionicons name="videocam" size={18} color="#FFFFFF" />
            <Text style={styles.videoChatText}>Video Chat</Text>
          </TouchableOpacity>
        </View>
      )}

      {toast && (
        <View pointerEvents="none" style={[styles.toastWrap, { top: insets.top + 16 }]}>
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        </View>
      )}

    </View>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tabBtn} onPress={onPress} activeOpacity={0.85}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {active ? <View style={styles.tabUnderline} /> : null}
    </TouchableOpacity>
  );
}

function LevelCard({
  bg, title, level, meta, icon, bgImage, onPress,
}: {
  bg: string;
  title: string;
  level: number;
  meta: string;
  icon?: ReturnType<typeof require>;
  /** Full-bleed level background art (Charm). Falls back to the solid `bg` when absent. */
  bgImage?: ReturnType<typeof require>;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.levelCard, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
    >
      {bgImage ? (
        <Image source={bgImage} style={styles.levelBgImage} contentFit="fill" />
      ) : null}
      <View style={styles.levelTop}>
        {icon ? (
          <Image source={icon} style={styles.levelHeroIcon} contentFit="contain" />
        ) : null}
        <View style={styles.levelTextBlock}>
          <Text style={styles.levelTitle}>{title}</Text>
          <Text style={styles.levelLevel}>Lv {level}</Text>
        </View>
      </View>
      <View style={styles.levelMetaRow}>
        <Text style={styles.levelMeta}>{meta}</Text>
      </View>
    </TouchableOpacity>
  );
}

const SUPPORTER_FRAME_SOURCES = {
  1: require('../../../assets/supporter_ranking/podium_frame_1.png'),
  2: require('../../../assets/supporter_ranking/podium_frame_2.png'),
  3: require('../../../assets/supporter_ranking/podium_frame_3.png'),
} as const;

const SUPPORTER_PREVIEW_FRAME: Record<1 | 2 | 3, { width: number; height: number; innerDiameter: number }> = {
  1: { width: 52, height: 54, innerDiameter: 36 },
  2: { width: 48, height: 48, innerDiameter: 32 },
  3: { width: 48, height: 48, innerDiameter: 32 },
};

function SupporterRankedAvatar({
  entry,
  rank,
}: {
  entry: FanEntry | undefined;
  rank: 1 | 2 | 3;
}) {
  const { width, height, innerDiameter } = SUPPORTER_PREVIEW_FRAME[rank];
  const user = entry?.user;
  const initial = (user?.displayName?.[0] ?? '?').toUpperCase();

  return (
    <View style={[styles.supporterAvatarWrap, { width, height }]}>
      <View
        style={[
          styles.supporterAvatarClip,
          {
            width: innerDiameter,
            height: innerDiameter,
            borderRadius: innerDiameter / 2,
          },
        ]}
      >
        {user?.avatar ? (
          <Image
            source={{ uri: user.avatar }}
            style={{ width: innerDiameter, height: innerDiameter }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              styles.supporterAvatarPlaceholder,
              { width: innerDiameter, height: innerDiameter, borderRadius: innerDiameter / 2 },
            ]}
          >
            <Text style={[styles.supporterAvatarInitial, { fontSize: innerDiameter * 0.38 }]}>
              {initial}
            </Text>
          </View>
        )}
      </View>
      <Image
        source={SUPPORTER_FRAME_SOURCES[rank]}
        style={styles.supporterFrameOverlay}
        contentFit="contain"
        pointerEvents="none"
      />
    </View>
  );
}

function SupporterPreviewSection({
  supporters,
  onPress,
}: {
  supporters: FanEntry[];
  onPress: () => void;
}) {
  const top3 = supporters.slice(0, 3);

  return (
    <TouchableOpacity style={styles.supporterSection} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.supporterHeader}>
        <Text style={styles.sectionTitle}>Supporter</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
      </View>
      <View style={styles.supporterAvatarsRow}>
        <SupporterRankedAvatar entry={top3[0]} rank={1} />
        <SupporterRankedAvatar entry={top3[1]} rank={2} />
        <SupporterRankedAvatar entry={top3[2]} rank={3} />
      </View>
    </TouchableOpacity>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  backBtn: { padding: Spacing.md, paddingLeft: Spacing.lg },

  // Hero
  hero: { width: '100%', position: 'relative' },
  heroTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  heroIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Floating party card
  partyCard: {
    position: 'absolute',
    right: 14,
    top: '38%',
    width: 92,
    height: 116,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  partyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  partyLabel: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  partyLabelText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  partyMicBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  partyTime: {
    position: 'absolute',
    bottom: 6,
    alignSelf: 'center',
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Mini avatar — footprint fits frame ring (UserAvatar sizes outer box when framed)
  heroAvatarMini: {
    position: 'absolute',
    bottom: -24,
    left: 0,
    right: 0,
    height: HERO_AVATAR_FRAME_SIZE,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarMiniImg: { width: '100%', height: '100%' },

  // Identity
  profileCardShell: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  profileCardInner: {
    paddingBottom: Spacing.sm,
  },
  identitySection: {
    flexDirection: 'column',
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  nameRowSide: { width: 40 },
  nameRowCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayName: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', flexShrink: 1 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  copySuper: {
    marginBottom: 6,
  },
  metaText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  genderPill: {
    flexDirection: 'row',
    minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 6,
    backgroundColor: '#FF6B9D',
    alignItems: 'center', justifyContent: 'center',
  },
  genderIcon: { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },
  flagText: { fontSize: 13 },
  profileTagsRow: {
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 6,
  },
  flagWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  flagIcon: { width: 32, height: 22 },

  favBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFE9F0',
    alignItems: 'center', justifyContent: 'center',
    marginTop: -Spacing.sm,
  },
  favBtnActive: { backgroundColor: '#E5E5E5' },

  // Follow row
  followRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.lg,
  },
  followLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  followNum: { color: '#1A1A1A', fontWeight: '700' },

  // Tabs — underline active, equal-width columns
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8EC',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: { fontSize: 15, color: Colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: '#1A1A1A', fontWeight: '700' },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 1.5,
  },

  tabContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.md },

  // Level cards — fixed 168×73 (360×156 art), centered as a pair
  levelCardsSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  levelCardsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: LEVEL_CARD_GAP,
  },
  levelCard: {
    width: LEVEL_CARD_WIDTH,
    height: LEVEL_CARD_HEIGHT,
    borderRadius: 14,
    overflow: 'hidden',
  },
  // Full-bleed level background art; stretched to the card (the source images
  // are already card-shaped). Sits behind the content via absolute fill.
  levelBgImage: { ...StyleSheet.absoluteFillObject },
  levelTop: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  levelHeroIcon: { width: 38, height: 38 },
  levelTextBlock: { flex: 1, alignItems: 'flex-start' },
  // Text shadow keeps the white label readable across both dark and light
  // background tiers (e.g. the pale low-level Charm backgrounds).
  levelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  levelLevel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  levelMetaRow: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  levelMeta: { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },

  supporterSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E8EC',
    paddingTop: Spacing.md,
  },
  supporterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  supporterAvatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  supporterAvatarWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supporterAvatarClip: {
    overflow: 'hidden',
    backgroundColor: '#F5F4F9',
    zIndex: 0,
  },
  supporterFrameOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  supporterAvatarPlaceholder: {
    backgroundColor: '#F5F4F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supporterAvatarInitial: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  // Gift gallery
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  sectionMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionMetaText: { fontSize: 12, color: Colors.textTertiary },

  giftRow: { flexDirection: 'row', gap: Spacing.sm },
  giftCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#F5F4F9',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  giftImg: { width: '100%', height: '100%' },

  // Personal info
  bioBox: {
    backgroundColor: '#EFEEF3',
    borderRadius: 10,
    padding: Spacing.md,
    minHeight: 80,
  },
  bioText: { fontSize: 13, color: '#1A1A1A', lineHeight: 19 },
  bioPlaceholder: { fontSize: 13, color: Colors.textTertiary, fontStyle: 'italic' },

  // Empty tab
  emptyTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTabText: { fontSize: 13, color: Colors.textTertiary },
  momentsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  momentTile: {
    width: (SCREEN_W - Spacing.lg * 2 - 8) / 3,
    aspectRatio: 1,
    backgroundColor: '#EEE',
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  momentTextTile: { backgroundColor: Colors.primarySubtle, padding: 8, justifyContent: 'center' },
  momentCaptionText: { fontSize: 11, color: '#1A1A1A' },
  momentBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  // Bottom action bar
  bottomBar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  bottomFollowBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: '#FFE9F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bottomFollowingBtn: { backgroundColor: '#F2F0F7' },
  bottomFollowText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B9D',
  },
  messageBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: '#F2EEFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  messageBtnText: { fontSize: 14, fontWeight: '700', color: '#7B4FFF' },
  videoChatBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: '#7B4FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  videoChatText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  toastWrap: {
    position: 'absolute',
    left: 0, right: 0,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: 'rgba(17,17,17,0.92)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radius.full,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
