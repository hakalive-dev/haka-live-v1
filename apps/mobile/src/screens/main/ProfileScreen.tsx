import React, { useCallback, useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CopyIcon } from '@components/CopyIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useStaleFocusReload } from '@hooks/useStaleFocusReload';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Clipboard from 'expo-clipboard';

import { RootStackParamList } from '@navigation/types';
import { usersApi } from '@api/users';
import { walletApi } from '@api/wallet';
import { useWalletBalanceQuery } from '@hooks/queries/useWalletBalanceQuery';
import { useUserLevelQuery } from '@hooks/queries/useLevelQueries';
import { authApi } from '@api/auth';
import { TokenStorage } from '@/storage';
import { CharmLevelBadge } from '@components/CharmLevelBadge';
import { apiClient, formatApiError } from '@api/client';
import { bannersApi, type Banner } from '@api/banners';
import { settingsApi } from '@api/settings';
import { setUser } from '../../store/authSlice';
import { setPendingVisitor } from '../../store/profileSlice';
import { setWalletBalance as syncWalletToStore } from '../../store/walletSlice';
import { Colors, Radius, Spacing } from '@/theme';
import { ProfileSkeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import { StoreItemMedia } from '@components/StoreItemMedia';
import { CosmeticBackground } from '@components/CosmeticBackground';
import { UserIdBadge } from '@components/UserIdBadge';
import { useLayout } from '@hooks/useLayout';
import type { PublicUser, VisitorEntry, WalletBalance } from '@/types';
import type { RootState, AppDispatch } from '../../store';
import { canAccessLevelTask } from '@/utils/levelTaskEligibility';
import { getGenderPillBackground, getGenderSymbol } from '@/utils/genderDisplay';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Menu icon assets ──────────────────────────────────────────────────────────

const MENU_ICONS = {
  apply_agency:  require('../../../assets/menu-icons/apply_agency.png'),
  apply_host:    require('../../../assets/menu-icons/apply_host.png'),
  become_agent:  require('../../../assets/menu-icons/become_agent.png'),
  become_host:   require('../../../assets/menu-icons/become_host.png'),
  invite:        require('../../../assets/menu-icons/Invite.png'),
  store:         require('../../../assets/menu-icons/store_button.png'),
  call:          require('../../../assets/menu-icons/Group 11.png'),
  account_info:  require('../../../assets/menu-icons/user-square-alt.png'),
  follow_us:     require('../../../assets/menu-icons/facebook.png'),          // placeholder
  auth:          require('../../../assets/menu-icons/check-verified-02.png'),
  live_data:     require('../../../assets/menu-icons/live_data.png'),
  level:         require('../../../assets/menu-icons/my_level_icon.png'),
  backpack:      require('../../../assets/menu-icons/backpack.png'),
  settings:      require('../../../assets/menu-icons/setting-2.png'),
  help:          require('../../../assets/menu-icons/Help circle.png'),
  about_us:      require('../../../assets/menu-icons/warning-2.png'),
  facebook:      require('../../../assets/menu-icons/facebook.png'),
  youtube:       require('../../../assets/menu-icons/youtube.png'),
  host_center:   require('../../../assets/menu-icons/host_center.png'),
  host_data:     require('../../../assets/menu-icons/host_data.png'),
  agency_center: require('../../../assets/menu-icons/become_host.png'),
  coin_seller:   require('../../../assets/menu-icons/coin_seller.png'),
  payroll:       require('../../../assets/menu-icons/payroll.png'),
} as const;

type MenuIconKey = keyof typeof MENU_ICONS;

// ── Menu configuration ─────────────────────────────────────────────────────────

type MenuItem = {
  id: string;
  label: string;
  icon: MenuIconKey;
  onPress?: () => void;
};

// ── ProfileScreen ─────────────────────────────────────────────────────────────

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<Nav>();
  const authUser       = useSelector((state: RootState) => state.auth.user);
  const isFemaleHost   = canAccessLevelTask(authUser);
  const walletStore    = useSelector((state: RootState) => state.wallet);
  const pendingVisitor = useSelector((state: RootState) => state.profile.pendingVisitor);
  const profileVersion = useSelector((state: RootState) => state.profile.profileVersion);
  const { contentWidth, isTablet } = useLayout();

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [visitors, setVisitors] = useState<VisitorEntry[]>([]);
  const [visitorTotal, setVisitorTotal] = useState(0);
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const [agentBanner, setAgentBanner] = useState<Banner | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [callsEnabled, setCallsEnabled] = useState(true);
  const userId = authUser?.id;
  const levelQuery = useUserLevelQuery(userId, { isOwn: true });
  const levelInfo = levelQuery.data ?? null;
  useWalletBalanceQuery({ enabled: Boolean(userId) });
  const load = useCallback(async () => {
    if (!userId) return false;
    try {
      const [meResult, profResult, visResult, balResult, bannerResult, settingsResult] = await Promise.allSettled([
        authApi.getMe(),
        usersApi.profile(userId),
        usersApi.myVisitors(),
        walletApi.getBalance(),
        bannersApi.list('profile_agent'),
        settingsApi.getSettings(),
      ]);
      if (meResult.status === 'fulfilled') {
        dispatch(setUser(meResult.value));
        void TokenStorage.setUserJson(JSON.stringify(meResult.value));
      }
      if (profResult.status === 'fulfilled') setProfile(profResult.value);
      if (visResult.status === 'fulfilled') {
        setVisitors(visResult.value.items.slice(0, 6));
        setVisitorTotal(visResult.value.total);
      }
      if (balResult.status === 'fulfilled') {
        setWalletBalance(balResult.value);
        dispatch(syncWalletToStore(balResult.value));
      }
      if (bannerResult.status === 'fulfilled') setAgentBanner(bannerResult.value[0] ?? null);
      void levelQuery.refetch();
      if (settingsResult.status === 'fulfilled') setCallsEnabled(settingsResult.value.calls_enabled ?? true);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [userId, dispatch, levelQuery]);

  const { reload: focusReload, markLoaded, invalidate } = useStaleFocusReload(
    async () => {
      if (await load()) markLoaded();
    },
    {
      staleMs: 180_000,
      enabled: Boolean(userId),
      onStaleSkip: () => setLoading(false),
    },
  );

  useEffect(() => {
    if (!userId || profileVersion === 0) return;
    invalidate();
    void focusReload(true);
  }, [profileVersion, userId, invalidate, focusReload]);

  useEffect(() => {
    if (!pendingVisitor) return;
    const knownInPreview = visitors.some(v => v.user.id === pendingVisitor.user.id);
    setVisitors(prev => {
      const filtered = prev.filter(v => v.user.id !== pendingVisitor.user.id);
      return [pendingVisitor, ...filtered].slice(0, 6);
    });
    if (!knownInPreview) setVisitorTotal((c) => c + 1);
    dispatch(setPendingVisitor(null));
  }, [pendingVisitor, visitors, dispatch]);

  const handleToggleCalls = useCallback(async () => {
    const next = !callsEnabled;
    setCallsEnabled(next);
    try {
      await settingsApi.updateSettings({ calls_enabled: next });
    } catch {
      setCallsEnabled(!next);
    }
  }, [callsEnabled]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await focusReload(true);
    setRefreshing(false);
  }, [focusReload]);

  const handleBannerPress = useCallback((banner: Banner) => {
    const value = banner.redirectValue?.trim();
    if (!value) return;
    switch (banner.redirectType) {
      case 'external':
        Linking.openURL(value).catch(() => Alert.alert('Error', 'Could not open link'));
        break;
      case 'user_profile':
        navigation.navigate('PublicProfile', { userId: value });
        break;
      default:
        break;
    }
  }, [navigation]);

  const pickAndUploadAvatar = useCallback(async (source: 'camera' | 'library') => {
    const permResult = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permResult.granted) {
      Alert.alert('Permission required', `Please allow access to your ${source === 'camera' ? 'camera' : 'photo library'}.`);
      return;
    }

    const pickerFn = source === 'camera'
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await pickerFn({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];

    // Resize + recompress to JPEG 256x256 before upload — keeps avatar bytes ~30 KB
    // instead of multi-MB originals, which is the bulk of cached egress on this surface.
    const resized = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 256, height: 256 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );
    const uri = resized.uri;
    const mimeType = 'image/jpeg';
    const validExt = 'jpg' as const;

    try {
      // Step 1: get a signed upload URL from Supabase via the backend
      const { data: signedData } = await apiClient.post('/profile/avatar', { ext: validExt });

      // Step 2: upload the image bytes directly to Supabase. Cache-Control "immutable" is
      // safe because the backend names each upload with Date.now(), so URLs never repeat.
      const blob = await fetch(uri).then((r) => r.blob());
      const uploadRes = await fetch(signedData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
          // Supabase signed upload URLs require the returned token as x-signature.
          'x-signature': signedData.token,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
        body: blob,
      });
      if (!uploadRes.ok) {
        let details = '';
        try {
          details = (await uploadRes.text()).trim();
        } catch {
          /* ignore */
        }
        throw new Error(
          `Storage upload failed (${uploadRes.status}${uploadRes.statusText ? ` ${uploadRes.statusText}` : ''})${
            details ? `: ${details}` : ''
          }`,
        );
      }

      // Step 3: save the public URL to the user's profile
      const { data: updatedUser } = await apiClient.patch('/profile/me', { avatar: signedData.publicUrl });
      dispatch(setUser({ ...authUser!, ...updatedUser, avatar: signedData.publicUrl }));
      Alert.alert('Success', 'Profile photo updated!');
    } catch (err: unknown) {
      Alert.alert('Error', formatApiError(err));
    }
  }, [dispatch, authUser]);

  const handleAvatarPress = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) pickAndUploadAvatar('camera');
          if (index === 2) pickAndUploadAvatar('library');
        },
      );
    } else {
      Alert.alert('Change Profile Photo', '', [
        { text: 'Take Photo', onPress: () => pickAndUploadAvatar('camera') },
        { text: 'Choose from Library', onPress: () => pickAndUploadAvatar('library') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [pickAndUploadAvatar]);

  // ── Responsive dimensions ──────────────────────────────────────────────────
  const avatarSize = 68;

  // Menu grid: 4 columns on phone, up to 6 on tablet
  const menuCols = isTablet ? 6 : 4;
  const menuItemWidth = Math.floor((contentWidth - Spacing.sm * (menuCols - 1)) / menuCols);

  if (loading || !authUser) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ProfileSkeleton />
      </View>
    );
  }

  const displayName = authUser.displayName || authUser.username || '';
  const genderIcon = getGenderSymbol(authUser.gender);
  const genderPillBg = getGenderPillBackground(authUser.gender);
  const equippedDynamicProfile =
    authUser.equippedDynamicProfile ?? profile?.equippedDynamicProfile ?? null;
  const equippedProfileCard =
    authUser.equippedProfileCard ?? profile?.equippedProfileCard ?? null;

  // Role-specific items (rendered in their own card above the main menu)
  const getRoleItems = (): MenuItem[] => {
    const coinSellerItem: MenuItem = {
      id: 'coinseller', label: 'Coin Seller', icon: 'coin_seller', onPress: () => navigation.navigate('CoinSeller'),
    };
    const payrollItem: MenuItem = {
      id: 'payroll', label: 'Payroll', icon: 'payroll', onPress: () => navigation.navigate('Payroll'),
    };
    const payrollIfActive = authUser.isPayrollAgent ? [payrollItem] : [];

    switch (authUser.role) {
      case 'payroll_agent':
        return [payrollItem];
      case 'host':
        return [
          { id: 'hostcenter', label: 'Host Center',  icon: 'host_center', onPress: () => navigation.navigate('HostCenter') },
          { id: 'hostdata',   label: 'Host Data',    icon: 'host_data',   onPress: () => navigation.navigate('HostData') },
          ...payrollIfActive,
        ];
      case 'agent':
        return [
          { id: 'agency',     label: 'Agency Center', icon: 'agency_center', onPress: () => navigation.navigate('AgencyCenter') },
          coinSellerItem,
          ...payrollIfActive,
        ];
      default: // normal_user
        return [
          { id: 'becomeagent', label: 'Become Agent', icon: 'become_agent', onPress: () => navigation.navigate('BecomeAgent') },
          { id: 'becomehost',  label: 'Become Host',  icon: 'become_host',  onPress: () => navigation.navigate('BecomeHost') },
        ];
    }
  };

  // Main menu grid (shown in a second white card)
  const COMMON_MENU_ITEMS: MenuItem[] = [
    { id: 'invite',       label: 'Invite',       icon: 'invite',       onPress: () => navigation.navigate('InviteFriends') },
    { id: 'store',        label: 'Store',        icon: 'store',        onPress: () => navigation.navigate('Store', { initialTab: 'mine' }) },
    { id: 'mylevel',      label: 'My Level',     icon: 'level',        onPress: () => navigation.navigate('Level', {}) },
    { id: 'call',         label: 'Call',         icon: 'call',         onPress: handleToggleCalls },
    { id: 'accountinfo',  label: 'Account Info', icon: 'account_info', onPress: () => navigation.navigate('Account') },
    { id: 'followus',     label: 'Follow Us',    icon: 'follow_us' },
    { id: 'auth',         label: 'Auth',         icon: 'auth',         onPress: () => navigation.navigate('Authentication') },
    { id: 'settings',     label: 'Setting',      icon: 'settings',     onPress: () => navigation.navigate('Settings') },
    { id: 'help',         label: 'Help',         icon: 'help',         onPress: () => navigation.navigate('HelpCenter') },
    { id: 'about',        label: 'About',        icon: 'about_us' },
  ];

  const roleItems = getRoleItems();

  // Chunk COMMON_MENU_ITEMS into rows of menuCols
  const menuRows: MenuItem[][] = [];
  for (let i = 0; i < COMMON_MENU_ITEMS.length; i += menuCols) {
    menuRows.push(COMMON_MENU_ITEMS.slice(i, i + menuCols));
  }

  const SHORTCUTS = [
    {
      id: 'reward',
      label: 'Reward',
      image: require('../../../assets/shortcuts/gift.png'),
      bg: 'rgba(211,167,239,0.05)',
      circle: 'rgba(211,167,239,0.7)',
      onPress: () =>
        navigation.navigate(isFemaleHost ? 'FemaleHostTask' : 'NewLevelTask'),
    },
    { id: 'rank',   label: 'Rank',   image: require('../../../assets/shortcuts/game.png'),   bg: 'rgba(255,200,80,0.05)',  circle: 'rgba(255,200,80,0.6)',  onPress: () => navigation.navigate('Ranking', { initialTab: 'agent' }) },
    { id: 'game',   label: 'Game',   image: require('../../../assets/shortcuts/trophy.png'), bg: 'rgba(178,132,237,0.05)', circle: 'rgba(178,132,237,0.65)', onPress: () => navigation.navigate('Ranking', { initialTab: 'game' }) },
    { id: 'store',  label: 'Store',  image: require('../../../assets/shortcuts/store.png'),  bg: 'rgba(15,147,245,0.05)',  circle: 'rgba(15,147,245,0.55)', onPress: () => navigation.navigate('Store', {}) },
  ];

  // Shortcut: image overlaps card top by 23px (per design spec)
  const SHORTCUT_OVERLAP = 23;

  return (
    <View style={styles.screen}>
      {/* Top decorative background image */}
      <Image
        source={require('../../../assets/user-bg.png')}
        style={styles.headerBg}
        contentFit="cover"
        contentPosition="top"
      />
      {equippedDynamicProfile?.image ? (
        <View style={styles.dynamicProfileBg} pointerEvents="none">
          <StoreItemMedia
            source={equippedDynamicProfile.image}
            size={420}
            fillContainer
            replayOnFocus
          />
        </View>
      ) : null}
      <ScrollView
        style={[styles.scrollFlex, { paddingTop: insets.top }]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 86 + insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
      {/* ── Identity section ────────────────────────────────────────────── */}
      <CosmeticBackground
        source={equippedProfileCard?.image}
        style={styles.profileCardShell}
        contentStyle={styles.profileCardInner}
      >
      <View style={styles.identityRow}>
        <TouchableOpacity style={styles.avatarWrap} onPress={handleAvatarPress} activeOpacity={0.7}>
          <UserAvatar
            user={{
              displayName,
              avatar: authUser.avatar,
              equippedFrame: authUser.equippedFrame ?? null,
              equippedRing: authUser.equippedRing ?? null,
            }}
            size={avatarSize}
            replayFrameOnFocus
          />
        </TouchableOpacity>

        <View style={styles.identityInfo}>
          <View style={styles.nameRow}>
            <TouchableOpacity
              style={styles.nameRowLeft}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('PublicProfile', { userId: authUser!.id })}
            >
              <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.badgeRow}>
            {genderIcon && (
              <View style={[styles.genderPill, { backgroundColor: genderPillBg }]}>
                <Text style={styles.genderIcon}>{genderIcon}</Text>
                {typeof authUser.age === 'number' && authUser.age > 0 && (
                  <Text style={styles.genderIcon}> {authUser.age}</Text>
                )}
              </View>
            )}
            {(levelInfo?.charmLevel ?? 0) > 0 ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation.navigate('Level', {})}
              >
                <CharmLevelBadge level={levelInfo?.charmLevel ?? 0} size={18} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.idRow}>
            {authUser.activeSpecialId ? (
              <UserIdBadge
                hakaId={authUser.hakaId || '000000'}
                activeSpecialId={authUser.activeSpecialId}
                activeSpecialIdLevel={authUser.activeSpecialIdLevel}
                width={108}
                height={26}
                hidePlain
              />
            ) : (
              <Text style={styles.hakaId}>ID: {authUser.hakaId || '000000'}</Text>
            )}
            <TouchableOpacity
              hitSlop={8}
              style={styles.copySuper}
              onPress={async () => {
                await Clipboard.setStringAsync(authUser.activeSpecialId ?? authUser.hakaId ?? '000000');
                if (Platform.OS === 'android') {
                  ToastAndroid.show('ID copied', ToastAndroid.SHORT);
                } else {
                  Alert.alert('Copied', 'ID copied to clipboard');
                }
              }}
            >
              <CopyIcon size={14} />
            </TouchableOpacity>
            <View style={styles.idRowSpacer} />
            {visitors.length > 0 && (
              <View style={styles.newPill}>
                <Text style={styles.newPillText}>New</Text>
              </View>
            )}
            <TouchableOpacity
              hitSlop={8}
              onPress={() => navigation.navigate('PublicProfile', { userId: authUser.id })}
            >
              <Ionicons name="chevron-forward" size={18} color="rgba(0,0,0,0.7)" />
            </TouchableOpacity>
          </View>

          {/* ── Stats row (compact, under ID) ─────────────────────────── */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('Social', { userId: authUser.id, displayName, initialTab: 'Friends' })}
            >
              <Text style={styles.statValue}>{profile?.friendCount ?? 0}</Text>
              <Text style={styles.statLabel}>Friends</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('Social', { userId: authUser.id, displayName, initialTab: 'Following' })}
            >
              <Text style={styles.statValue}>{profile?.followingCount ?? 0}</Text>
              <Text style={styles.statLabel}>Follow</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('Social', { userId: authUser.id, displayName, initialTab: 'Followers' })}
            >
              <Text style={styles.statValue}>{profile?.followerCount ?? 0}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('Social', { userId: authUser.id, displayName, initialTab: 'Visitors' })}
            >
              <View style={styles.visitorsValueRow}>
                <Text style={styles.statValue}>{visitorTotal}</Text>
                {visitorTotal > 0 && <View style={styles.redDot} />}
              </View>
              <Text style={styles.statLabel}>Visitors</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </CosmeticBackground>

      {/* ── Noble privileges banner ─────────────────────────────────────── */}
      <TouchableOpacity style={styles.nobleBannerWrap} activeOpacity={0.85}>
        <LinearGradient
          colors={['#FED96E', '#FFA800']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.nobleBanner}
        >
          <View style={styles.nobleInnerOutline} pointerEvents="none" />
          <Text style={styles.nobleLabel}>Noble privileges</Text>
          <LinearGradient
            colors={['#E78115', '#C56C0E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nobleOpenBtn}
          >
            <Text style={styles.nobleOpenText}>Open</Text>
          </LinearGradient>
        </LinearGradient>

        {/* Crown (vip.png) + dark VIP badge — floats above the banner's left edge */}
        <View style={styles.nobleCrownWrap} pointerEvents="none">
          <Image
            source={require('../../../assets/home/vip.png')}
            style={styles.nobleCrownImg}
            contentFit="contain"
          />
          <View style={styles.nobleVipBadge}>
            <Text style={styles.nobleVipText}>VIP</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* ── Shortcuts row ───────────────────────────────────────────────── */}
      <View style={styles.shortcutsRow}>
        {SHORTCUTS.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={styles.shortcutItem}
            activeOpacity={0.75}
            onPress={s.onPress}
          >
            {/* Spacer for the overlapping image */}
            <View style={{ height: SHORTCUT_OVERLAP }} />

            {/* Colored rounded card with label inside */}
            <View style={[styles.shortcutBg, { backgroundColor: s.bg }]}>
              <Text style={styles.shortcutLabel}>{s.label}</Text>
            </View>

            {/* Circle bg + image — overlaps above card */}
            <View style={styles.shortcutIconWrap}>
              <View style={[styles.shortcutCircle, { backgroundColor: s.circle }]} />
              <Image
                source={s.image}
                style={styles.shortcutImg}
                contentFit="contain"
              />
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Wallet section — single white card, two items inside ────────── */}
      <View style={styles.walletCard}>
        <TouchableOpacity style={styles.walletItem} onPress={() => navigation.navigate('TopUp')} activeOpacity={0.85}>
          <View style={styles.walletAmountRow}>
            <Image source={require('../../../assets/coin.png')} style={styles.walletIcon} contentFit="cover" />
            <Text style={styles.walletAmount}>
              {(walletStore.loaded ? walletStore.coinBalance : (walletBalance?.coinBalance ?? 0)).toLocaleString()}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.walletBtn, { backgroundColor: 'rgba(255,204,0,0.2)' }]}
            onPress={() => navigation.navigate('TopUp')}
            hitSlop={4}
          >
            <Text style={[styles.walletBtnText, { color: '#D1723A' }]}>Top Up</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        <TouchableOpacity style={styles.walletItem} onPress={() => navigation.navigate('Withdraw')} activeOpacity={0.85}>
          <View style={styles.walletAmountRow}>
            <Image source={require('../../../assets/bean.png')} style={styles.walletIcon} contentFit="cover" />
            <Text style={styles.walletAmount}>
              {(walletStore.loaded ? walletStore.beanBalance : (walletBalance?.beanBalance ?? 0)).toLocaleString()}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.walletBtn, { backgroundColor: 'rgba(255, 45, 85, 0.2)' }]}
            onPress={() => navigation.navigate('Withdraw')}
            hitSlop={4}
          >
            <Text style={[styles.walletBtnText, { color: '#FF2D55' }]}>Withdraw</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>

      {/* ── Agent Recruiting banner (admin-managed) ─────────────────────── */}
      {agentBanner && (
        <TouchableOpacity
          style={styles.agentBanner}
          activeOpacity={0.85}
          onPress={() => handleBannerPress(agentBanner)}
        >
          <Image
            source={{ uri: agentBanner.imageUrl }}
            style={styles.agentBannerImg}
            contentFit="cover"
          />
        </TouchableOpacity>
      )}

      {/* ── Role-specific menu card (Become Agent / Become Host) ────────── */}
      {roleItems.length > 0 && (
        <View style={styles.menuCard}>
          <View style={styles.menuRow}>
            {roleItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.menuItem, { width: menuItemWidth }]}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={styles.menuIconWrap}>
                  <Image source={MENU_ICONS[item.icon]} style={styles.menuIcon} contentFit="contain" />
                </View>
                <Text style={styles.menuLabel} numberOfLines={2}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            {Array.from({ length: Math.max(0, menuCols - roleItems.length) }).map((_, i) => (
              <View key={`role-empty-${i}`} style={{ width: menuItemWidth }} />
            ))}
          </View>
        </View>
      )}

      {/* ── Common menu grid ────────────────────────────────────────────── */}
      <View style={styles.menuCard}>
        {menuRows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.menuRow}>
            {row.map((item) => {
              const isCallItem = item.id === 'call';
              if (isCallItem) {
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.menuItem, { width: menuItemWidth }]}
                    onPress={handleToggleCalls}
                    activeOpacity={0.7}
                  >
                    <View style={styles.menuIconWrap}>
                      <Image
                        source={MENU_ICONS[item.icon]}
                        style={[styles.menuIcon, !callsEnabled && styles.menuIconOff]}
                        contentFit="contain"
                      />
                      <View style={[
                        styles.callToggleSwitch,
                        callsEnabled ? styles.callToggleSwitchOn : styles.callToggleSwitchOff,
                      ]}>
                        <View style={styles.callToggleKnob} />
                      </View>
                    </View>
                    <Text
                      style={[styles.menuLabel, !callsEnabled && styles.menuLabelDisabled]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.menuItem, { width: menuItemWidth }]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuIconWrap}>
                    <Image source={MENU_ICONS[item.icon]} style={styles.menuIcon} contentFit="contain" />
                  </View>
                  <Text style={styles.menuLabel} numberOfLines={2}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
            {/* Fill empty cells in the last row */}
            {row.length < menuCols &&
              Array.from({ length: menuCols - row.length }).map((_, i) => (
                <View key={`empty-${i}`} style={{ width: menuItemWidth }} />
              ))}
          </View>
        ))}
      </View>

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 420,
  },
  dynamicProfileBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 420,
    overflow: 'hidden',
  },
  profileCardShell: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  profileCardInner: {
    paddingVertical: Spacing.xs,
  },
  scrollFlex: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingTop: Spacing.sm,
  },

  // ── Identity
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  avatarWrap: {
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarBase: {
    // width / height / borderRadius set inline from avatarSize
  },
  avatarFallback: {
    backgroundColor: Colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  identityInfo: {
    flex: 1,
    paddingTop: 4,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  nameRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  genderPill: {
    flexDirection: 'row',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderIcon: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  newPill: {
    backgroundColor: '#FF2D55',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPillText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  idRowSpacer: {
    flex: 1,
  },
  copySuper: {
    alignSelf: 'center',
  },
  hakaId: {
    fontSize: 12,
    fontWeight: '400',
    color: '#000000',
  },

  // ── Stats
  statsRow: {
    flexDirection: 'row',
    marginTop: 6,
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '400',
    color: '#666666',
  },
  visitorsValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
  },
  redDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FF2D55',
    marginTop: 2,
  },

  // ── Shortcuts
  shortcutsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  shortcutItem: {
    width: 80,
    alignItems: 'center',
  },
  shortcutBg: {
    width: 80,
    height: 80,
    borderRadius: 14,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
  },
  shortcutIconWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    elevation: 2,
  },
  shortcutCircle: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    top: 12,
    marginLeft: 10,
  },
  shortcutImg: {
    width: 66,
    height: 66,
  },
  shortcutLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333333',
    textAlign: 'center',
  },

  // ── Wallet
  walletCard: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  walletItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  walletAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  walletIcon: {
    width: 24,
    height: 24,
  },
  walletAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
  },
  walletBtn: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Noble privileges banner (spec: 362×44 pill, crown extends 9px above)
  nobleBannerWrap: {
    marginHorizontal: 20,
    marginTop: Spacing.md + 9,
    position: 'relative',
  },
  nobleBanner: {
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 62,
    paddingRight: 6,
  },
  nobleInnerOutline: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  nobleLabel: {
    color: '#4A2700',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  nobleOpenBtn: {
    width: 60,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nobleOpenText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  nobleCrownWrap: {
    position: 'absolute',
    top: -9,
    left: 6,
    width: 52,
    height: 53,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  nobleCrownImg: {
    width: 52,
    height: 53,
  },
  nobleVipBadge: {
    position: 'absolute',
    bottom: 2,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: '#28261A',
  },
  nobleVipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },

  // ── Agent Recruiting banner
  agentBanner: {
    alignSelf: 'center',
    width: '90%',
    marginTop: Spacing.md,
    borderRadius: 9,
    overflow: 'hidden',
    aspectRatio: 362 / 64,
    backgroundColor: '#FFFFFF',
  },
  agentBannerImg: {
    width: '100%',
    height: '100%',
  },

  // ── Menu grid
  menuCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  menuItem: {
    alignItems: 'center',
    gap: 6,
  },
  menuIconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconWrapDisabled: {
    opacity: 0.45,
  },
  menuIcon: {
    width: 32,
    height: 32,
  },
  menuIconDisabled: {
    tintColor: '#999999',
  },
  menuIconBadgeOff: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: 10,
    fontWeight: '400',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 14,
  },
  menuLabelDisabled: {
    color: '#999999',
  },
  menuIconOff: {
    opacity: 0.45,
  },
  callToggleSwitch: {
    position: 'absolute',
    // Centered on the 32×32 menu icon inside the 48×48 wrap; sits on the lower part of Group 11.png
    bottom: 8,
    left: 12,
    width: 24,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 1.5,
    zIndex: 1,
  },
  callToggleSwitchOn: {
    backgroundColor: '#4CAF50',
    justifyContent: 'flex-end',
  },
  callToggleSwitchOff: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-start',
  },
  callToggleKnob: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },

  // ── Visitors
  visitorsSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  visitorsRow: {
    gap: Spacing.md,
  },
  visitorItem: {
    alignItems: 'center',
    gap: 5,
    width: 56,
  },
  visitorAvatarBase: {
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  visitorAvatarFallback: {
    backgroundColor: Colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitorName: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
  },
});
