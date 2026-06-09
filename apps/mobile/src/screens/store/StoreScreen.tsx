import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { Image } from 'expo-image';

import { useDispatch } from 'react-redux';
import { storeApi } from '@api/store';
import { authApi } from '@api/auth';
import { setUser } from '@/store/authSlice';
import { roomsApi } from '@api/rooms';
import { searchApi } from '@api/search';
import { UserAvatar } from '@components/UserAvatar';
import { useToast } from '@components/Toast';

const COIN_ICON = require('../../../assets/coin.png');
import { Colors, Radius, Spacing, Typography } from '@/theme';
import { StoreGridSkeleton } from '@components/Skeleton';
import { StoreItemMedia } from '@components/StoreItemMedia';
import type { StoreItem, UserStoreItem, StoreCategory, StoreCategoryItem, ThemePayload } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'Store'> | RootStackScreenProps<'StoreModal'>;
type HeaderTab = 'store' | 'mine' | 'box';

const HEADER_TABS: { key: HeaderTab; label: string }[] = [
  { key: 'store', label: 'Store' },
  { key: 'mine', label: 'Mine' },
  { key: 'box', label: 'Box' },
];

const LEVEL_OPTIONS = ['All', 'SSS', 'SS', 'S', 'A', 'B'] as const;
type LevelOption = (typeof LEVEL_OPTIONS)[number];

// Figma design tokens (Store is themed dark-purple, distinct from app base theme)
const STORE_BG = '#25203C';
const STORE_CARD_BG = 'rgba(223, 223, 223, 0.1)';
const STORE_PILL_TEXT = '#3D168B';
const STORE_WHITE = '#FFFFFF';
const STORE_MUTED = 'rgba(255, 255, 255, 0.6)';

// ── Special ID types ────────────────────────────────────────────────────────

type SpecialIdItem = {
  id: string;
  number: string;
  price: number;
  durationDays: number;
  level: string;
};

type MySpecialIdItem = {
  id: string;
  specialId: { id: string; number: string; level: string; durationDays: number };
  pricePaid: number;
  status: string;
  activatedAt: string | null;
  expiresAt: string | null;
  purchasedAt: string;
};

// Level → SVGA/PNG asset source key (consumed by StoreItemMedia)
const LEVEL_BADGE_SOURCE: Record<string, string> = {
  SSS: 'store/special-ids/SSS.svga',
  SS:  'store/special-ids/SS.svga',
  S:   'store/special-ids/S.svga',
  A:   'store/special-ids/A.svga',
  B:   'store/special-ids/B.svga',
};

function formatRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return `${days}d ${String(hours).padStart(2, '0')}h`;
}

async function resolveTargetRoomId(explicitRoomId?: string): Promise<string | null> {
  if (explicitRoomId) return explicitRoomId;
  const mine = await roomsApi.getMyActiveRoom();
  return mine?.id ?? null;
}

function buildThemeByStoreItemId(themes: ThemePayload[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const theme of themes) {
    if (theme.storeItemId) map.set(theme.storeItemId, theme.id);
  }
  return map;
}

// ── StoreScreen ──────────────────────────────────────────────────────────────

export function StoreScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const toast = useToast();
  const [headerTab, setHeaderTab] = useState<HeaderTab>(route.params?.initialTab ?? 'store');
  const [categories, setCategories] = useState<StoreCategoryItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<StoreCategory | null>(null);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [myItems, setMyItems] = useState<UserStoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelMenuOpen, setLevelMenuOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<LevelOption>('All');
  const [pendingLevel, setPendingLevel] = useState<LevelOption>('All');

  // Special ID state
  const [specialIds, setSpecialIds] = useState<SpecialIdItem[]>([]);
  const [mySpecialIds, setMySpecialIds] = useState<MySpecialIdItem[]>([]);

  // Buy/Send flow state
  const [selectedSid, setSelectedSid] = useState<SpecialIdItem | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [itemActionSheetOpen, setItemActionSheetOpen] = useState(false);
  const [sendMode, setSendMode] = useState<'special_id' | 'item'>('special_id');
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendSearch, setSendSearch] = useState('');
  const [sendResults, setSendResults] = useState<Array<{ id: string; displayName: string; avatar: string | null; hakaId: string; equippedFrame?: any }>>([]);
  const [sendSearching, setSendSearching] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [themeByStoreItemId, setThemeByStoreItemId] = useState<Map<string, string>>(new Map());
  const [activeThemeId, setActiveThemeId] = useState<string | null>(
    route.params?.activeThemeId ?? null,
  );
  const [applyingTheme, setApplyingTheme] = useState(false);

  const isSpecialIdCategory = activeCategory === 'special_id';
  const isThemeCategory = activeCategory === 'theme';

  // Load categories once
  const requestedCategory = route.params?.initialCategory as StoreCategory | undefined;
  useEffect(() => {
    storeApi.getCategories()
      .then((cats) => {
        setCategories(cats);
        if (requestedCategory && cats.some((c) => c.key === requestedCategory)) {
          setActiveCategory(requestedCategory);
        } else if (cats.length > 0) {
          setActiveCategory(cats[0].key);
        }
      })
      .catch((e) => console.warn('Store categories error:', e));
  }, [requestedCategory]);

  useEffect(() => {
    if (!isThemeCategory) return;
    roomsApi.getAvailableThemes()
      .then((themes) => setThemeByStoreItemId(buildThemeByStoreItemId(themes)))
      .catch(() => setThemeByStoreItemId(new Map()));
  }, [isThemeCategory]);

  // Load items when category or tab changes
  useEffect(() => {
    if (!activeCategory) return;
    setLoading(true);

    if (isSpecialIdCategory) {
      if (headerTab === 'store') {
        const lvl = selectedLevel === 'All' ? undefined : selectedLevel;
        storeApi.getSpecialIds(lvl)
          .then(setSpecialIds)
          .catch((e) => console.warn('Special IDs error:', e))
          .finally(() => setLoading(false));
      } else if (headerTab === 'mine') {
        storeApi.getMySpecialIds()
          .then(setMySpecialIds)
          .catch((e) => console.warn('My Special IDs error:', e))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    } else {
      if (headerTab === 'store') {
        storeApi.getItems(activeCategory)
          .then(setStoreItems)
          .catch((e) => console.warn('Store items error:', e))
          .finally(() => setLoading(false));
      } else if (headerTab === 'mine') {
        storeApi.getMyItems(activeCategory)
          .then(setMyItems)
          .catch((e) => console.warn('Store my items error:', e))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, [headerTab, activeCategory, isSpecialIdCategory, selectedLevel]);

  // Tap a regular item card → open Buy/Send action sheet
  const handleItemTap = useCallback((item: StoreItem) => {
    setSelectedItem(item);
    setItemActionSheetOpen(true);
  }, []);

  const applyThemeToRoom = useCallback(async (
    storeItemId: string,
    opts?: { dismissOnSuccess?: boolean; themeId?: string },
  ): Promise<boolean> => {
    const roomId = await resolveTargetRoomId(route.params?.roomId);
    if (!roomId) {
      Alert.alert(
        'No room',
        'Create or go live in your room first to apply a theme.',
      );
      return false;
    }

    const themeId = opts?.themeId ?? themeByStoreItemId.get(storeItemId);
    if (!themeId) {
      Alert.alert('Unavailable', 'This theme could not be loaded. Please try again.');
      return false;
    }

    setApplyingTheme(true);
    try {
      const res = await roomsApi.applyTheme(roomId, themeId);
      setActiveThemeId(res.theme.id);
      toast.show('Theme applied!', 'success');
      if (opts?.dismissOnSuccess) navigation.goBack();
      return true;
    } catch (e: unknown) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not apply theme');
      return false;
    } finally {
      setApplyingTheme(false);
    }
  }, [route.params?.roomId, themeByStoreItemId, navigation, toast]);

  const refreshAuthUser = useCallback(async () => {
    try {
      const freshUser = await authApi.getMe();
      dispatch(setUser(freshUser));
    } catch {
      // Non-fatal — store inventory still refreshes below.
    }
  }, [dispatch]);

  // "Buy" in the regular item action sheet
  const handleBuyItem = useCallback(async () => {
    if (!selectedItem) return;
    setItemActionSheetOpen(false);
    const item = selectedItem;
    Alert.alert(
      'Confirm Purchase',
      `Buy "${item.name}" for ${item.coin_cost.toLocaleString()} coins?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          onPress: async () => {
            try {
              await storeApi.purchase(item.id);
              await refreshAuthUser();
              if (item.category === 'theme') {
                const themes = await roomsApi.getAvailableThemes();
                const themeMap = buildThemeByStoreItemId(themes);
                setThemeByStoreItemId(themeMap);
                const applied = await applyThemeToRoom(item.id, {
                  themeId: themeMap.get(item.id),
                });
                if (!applied) {
                  Alert.alert('Success', `"${item.name}" purchased! Open your room to apply it.`);
                }
              } else {
                Alert.alert('Success', `"${item.name}" purchased and equipped!`);
              }
              if (activeCategory) {
                const items = await storeApi.getItems(activeCategory);
                setStoreItems(items);
              }
            } catch (e: unknown) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Could not purchase item');
            }
          },
        },
      ],
    );
  }, [selectedItem, activeCategory, applyThemeToRoom, refreshAuthUser]);

  // "Send" in the regular item action sheet → open send modal
  const handleOpenItemSendModal = useCallback(() => {
    setItemActionSheetOpen(false);
    setSendMode('item');
    setSendSearch('');
    setSendResults([]);
    setSendModalOpen(true);
  }, []);

  // Tap a Special ID → open action sheet
  const handleSpecialIdTap = useCallback((item: SpecialIdItem) => {
    setSelectedSid(item);
    setActionSheetOpen(true);
  }, []);

  // Buy action from action sheet
  const handleBuySpecialId = useCallback(async () => {
    if (!selectedSid) return;
    setActionSheetOpen(false);
    const item = selectedSid;
    Alert.alert(
      'Confirm Purchase',
      `Buy Special ID "${item.number}" (${item.level}) for ${item.price.toLocaleString()} coins?\n\nDuration: ${item.durationDays} days after activation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          onPress: async () => {
            try {
              await storeApi.purchaseSpecialId(item.id);
              Alert.alert('Success', `Special ID "${item.number}" purchased! Go to "Mine" to activate it.`);
              const lvl = selectedLevel === 'All' ? undefined : selectedLevel;
              const items = await storeApi.getSpecialIds(lvl);
              setSpecialIds(items);
            } catch (e: unknown) {
              Alert.alert('Failed', e instanceof Error ? e.message : 'Could not purchase');
            }
          },
        },
      ],
    );
  }, [selectedSid, selectedLevel]);

  // Send action from Special ID action sheet → open send modal
  const handleOpenSendModal = useCallback(() => {
    setActionSheetOpen(false);
    setSendMode('special_id');
    setSendSearch('');
    setSendResults([]);
    setSendModalOpen(true);
  }, []);

  // Search users for Send modal
  const handleSendSearch = useCallback(async (query: string) => {
    setSendSearch(query);
    const q = query.trim();
    if (q.length < 2) { setSendResults([]); return; }
    setSendSearching(true);
    try {
      const users = await searchApi.searchUsers(q);
      setSendResults(users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        avatar: u.avatar ?? null,
        hakaId: u.hakaId ?? '',
        equippedFrame: u.equippedFrame,
      })));
    } catch {
      setSendResults([]);
    } finally {
      setSendSearching(false);
    }
  }, []);

  const handleSendToUser = useCallback(async (recipientHakaId: string, recipientName: string) => {
    setSending(recipientHakaId);
    try {
      if (sendMode === 'special_id' && selectedSid) {
        await storeApi.sendSpecialId(selectedSid.id, recipientHakaId);
        setSendModalOpen(false);
        Alert.alert('Sent!', `Special ID "${selectedSid.number}" sent to ${recipientName}.`);
        const lvl = selectedLevel === 'All' ? undefined : selectedLevel;
        setSpecialIds(await storeApi.getSpecialIds(lvl));
      } else if (sendMode === 'item' && selectedItem) {
        await storeApi.sendItem(selectedItem.id, recipientHakaId);
        setSendModalOpen(false);
        Alert.alert('Sent!', `"${selectedItem.name}" sent to ${recipientName}.`);
      }
    } catch (e: unknown) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not send');
    } finally {
      setSending(null);
    }
  }, [sendMode, selectedSid, selectedItem, selectedLevel]);

  const handleEquip = useCallback(async (userItem: UserStoreItem) => {
    if (userItem.item.category === 'theme') {
      if (userItem.is_expired) {
        Alert.alert('Expired', 'This theme has expired and cannot be applied.');
        return;
      }
      await applyThemeToRoom(userItem.item.id, { dismissOnSuccess: true });
      return;
    }
    try {
      if (userItem.is_equipped) {
        await storeApi.unequip(userItem.id);
      } else {
        await storeApi.equip(userItem.id);
      }
      await refreshAuthUser();
      if (activeCategory) {
        const items = await storeApi.getMyItems(activeCategory);
        setMyItems(items);
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }, [activeCategory, applyThemeToRoom, refreshAuthUser]);

  const handleSpecialIdAction = useCallback(async (inv: MySpecialIdItem) => {
    if (inv.status === 'active') {
      Alert.alert(
        'Deactivate Special ID',
        `Deactivate "${inv.specialId.number}"? Your display ID will revert to your Haka ID.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Deactivate',
            style: 'destructive',
            onPress: async () => {
              try {
                await storeApi.deactivateSpecialId();
                const items = await storeApi.getMySpecialIds();
                setMySpecialIds(items);
              } catch (e: unknown) {
                Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
              }
            },
          },
        ],
      );
    } else if (inv.status === 'inactive') {
      Alert.alert(
        'Activate Special ID',
        `Activate "${inv.specialId.number}"? It will be active for ${inv.specialId.durationDays} days.\n\nAny currently active Special ID will be deactivated.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Activate',
            onPress: async () => {
              try {
                await storeApi.activateSpecialId(inv.id);
                Alert.alert('Success', `Special ID "${inv.specialId.number}" is now active!`);
                const items = await storeApi.getMySpecialIds();
                setMySpecialIds(items);
              } catch (e: unknown) {
                Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
              }
            },
          },
        ],
      );
    }
    // expired items do nothing
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={STORE_WHITE} />
        </TouchableOpacity>

        <View style={styles.headerTabsRow}>
          {HEADER_TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setHeaderTab(t.key)}
            >
              <Text style={[styles.headerTabText, headerTab === t.key && styles.headerTabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Level filter trigger */}
        <TouchableOpacity
          style={styles.levelDropdown}
          onPress={() => {
            setPendingLevel(selectedLevel);
            setLevelMenuOpen(true);
          }}
        >
          <Text style={styles.levelDropdownText}>{selectedLevel}</Text>
          <Ionicons
            name={levelMenuOpen ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={STORE_WHITE}
          />
        </TouchableOpacity>
      </View>

      {/* Level filter bottom sheet (light card, no backdrop) */}
      <Modal
        visible={levelMenuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setLevelMenuOpen(false)}
      >
        <Pressable style={styles.filterOverlay} onPress={() => setLevelMenuOpen(false)}>
          <Pressable
            style={[styles.filterSheet, { paddingBottom: insets.bottom + Spacing.lg }]}
            onPress={() => {}}
          >
            <View style={styles.filterHeader}>
              <TouchableOpacity onPress={() => setLevelMenuOpen(false)} hitSlop={8}>
                <Text style={styles.filterCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.filterTitle}>Filter</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedLevel(pendingLevel);
                  setLevelMenuOpen(false);
                }}
                hitSlop={8}
              >
                <Text style={styles.filterConfirm}>Confirm</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filterOptions}>
              {LEVEL_OPTIONS.map((lv) => {
                const isSelected = pendingLevel === lv;
                return (
                  <TouchableOpacity
                    key={lv}
                    style={[styles.filterOptionRow, isSelected && styles.filterOptionRowSelected]}
                    onPress={() => setPendingLevel(lv)}
                  >
                    <Text
                      style={[
                        styles.filterOptionText,
                        isSelected && styles.filterOptionTextSelected,
                      ]}
                    >
                      {lv}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Category tabs — scrollable, white pill for active */}
      {headerTab !== 'box' && categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryRow}
        >
          {categories.map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryTab, isActive && styles.categoryTabActive]}
                onPress={() => setActiveCategory(cat.key)}
              >
                <Text
                  style={[styles.categoryTabText, isActive && styles.categoryTabTextActive]}
                  numberOfLines={1}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Content */}
      {headerTab === 'store' && !isSpecialIdCategory && (
        <StoreGrid
          items={storeItems}
          loading={loading}
          onPurchase={handleItemTap}
          insets={insets}
        />
      )}
      {headerTab === 'store' && isSpecialIdCategory && (
        <SpecialIdStoreGrid
          items={specialIds}
          loading={loading}
          onPurchase={handleSpecialIdTap}
          insets={insets}
        />
      )}
      {headerTab === 'mine' && !isSpecialIdCategory && (
        <MineGrid
          items={myItems}
          loading={loading || applyingTheme}
          onEquip={handleEquip}
          insets={insets}
          isThemeCategory={isThemeCategory}
          activeThemeId={isThemeCategory ? activeThemeId : undefined}
          themeByStoreItemId={isThemeCategory ? themeByStoreItemId : undefined}
        />
      )}
      {headerTab === 'mine' && isSpecialIdCategory && (
        <MySpecialIdGrid
          items={mySpecialIds}
          loading={loading}
          onAction={handleSpecialIdAction}
          insets={insets}
        />
      )}
      {headerTab === 'box' && (
        <BoxView />
      )}

      {/* ── Buy / Send action sheet ─────────────────────────────────────── */}
      <Modal visible={actionSheetOpen} transparent animationType="fade" onRequestClose={() => setActionSheetOpen(false)}>
        <Pressable style={styles.actionSheetOverlay} onPress={() => setActionSheetOpen(false)}>
          <Pressable style={[styles.actionSheetCard, { paddingBottom: insets.bottom + Spacing.lg }]}>
            {selectedSid && (
              <View style={styles.actionSheetBadge}>
                <StoreItemMedia source={LEVEL_BADGE_SOURCE[selectedSid.level] ?? LEVEL_BADGE_SOURCE.B} size={180} style={{ width: 180, height: 60 }} />
                <Text style={[styles.actionSheetBadgeNum, { lineHeight: 60 }]}>{selectedSid.number}</Text>
              </View>
            )}
            <Text style={styles.actionSheetPrice}>
              {selectedSid?.price.toLocaleString()} coins · {selectedSid?.durationDays} days
            </Text>
            <View style={styles.actionSheetBtns}>
              <TouchableOpacity style={styles.sendBtn} onPress={handleOpenSendModal} activeOpacity={0.7}>
                <Text style={styles.sendBtnText}>Send</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.buyBtn} onPress={handleBuySpecialId} activeOpacity={0.7}>
                <Text style={styles.buyBtnText}>Buy</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Regular item Buy / Send action sheet ────────────────────────── */}
      <Modal visible={itemActionSheetOpen} transparent animationType="fade" onRequestClose={() => setItemActionSheetOpen(false)}>
        <Pressable style={styles.actionSheetOverlay} onPress={() => setItemActionSheetOpen(false)}>
          <Pressable style={[styles.actionSheetCard, { paddingBottom: insets.bottom + Spacing.lg }]}>
            {selectedItem && (
              <>
                <StoreItemMedia source={selectedItem.image} size={100} style={{ alignSelf: 'center', marginBottom: Spacing.sm }} />
                <Text style={[styles.actionSheetBadgeNum, { textAlign: 'center', marginBottom: 4 }]}>{selectedItem.name}</Text>
              </>
            )}
            <Text style={styles.actionSheetPrice}>
              {selectedItem?.coin_cost.toLocaleString()} coins
              {selectedItem?.duration_label ? ` · ${selectedItem.duration_label}` : ''}
            </Text>
            {selectedItem && selectedItem.is_for_sale === false && (
              <Text style={styles.notForSaleLabel}>Not For Sale</Text>
            )}
            <View style={styles.actionSheetBtns}>
              <TouchableOpacity style={styles.sendBtn} onPress={handleOpenItemSendModal} activeOpacity={0.7}>
                <Text style={styles.sendBtnText}>Send</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.buyBtn, selectedItem?.is_for_sale === false && styles.buyBtnDisabled]}
                onPress={handleBuyItem}
                activeOpacity={0.7}
                disabled={selectedItem?.is_for_sale === false}
              >
                <Text style={[styles.buyBtnText, selectedItem?.is_for_sale === false && styles.buyBtnTextDisabled]}>Buy</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Send-to modal ───────────────────────────────────────────────── */}
      <Modal visible={sendModalOpen} transparent animationType="slide" onRequestClose={() => setSendModalOpen(false)}>
        <View style={styles.sendModalWrap}>
          <View style={[styles.sendModalCard, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.sendModalHeader}>
              <View style={{ width: 28 }} />
              <Text style={styles.sendModalTitle}>Send to</Text>
              <TouchableOpacity hitSlop={8} onPress={() => setSendModalOpen(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <View style={styles.sendSearchRow}>
              <Ionicons name="search" size={18} color="#999" />
              <TextInput
                style={styles.sendSearchInput}
                placeholder="Search User ID"
                placeholderTextColor="#999"
                value={sendSearch}
                onChangeText={handleSendSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {sendSearch.length > 0 && (
                <TouchableOpacity hitSlop={8} onPress={() => { setSendSearch(''); setSendResults([]); }}>
                  <Ionicons name="close-circle" size={18} color="#999" />
                </TouchableOpacity>
              )}
            </View>
            {sendSearching && (
              <ActivityIndicator size="small" color="#7B4FFF" style={{ marginVertical: Spacing.md }} />
            )}
            <FlatList
              data={sendResults}
              keyExtractor={(u) => u.id}
              style={styles.sendResultList}
              renderItem={({ item: user }) => (
                <View style={styles.sendUserRow}>
                  <UserAvatar
                    user={{ displayName: user.displayName, avatar: user.avatar, equippedFrame: user.equippedFrame ?? null }}
                    size={44}
                  />
                  <Text style={styles.sendUserName} numberOfLines={1}>{user.displayName}</Text>
                  <TouchableOpacity
                    style={[styles.sendUserBtn, sending === user.hakaId && { opacity: 0.5 }]}
                    disabled={sending !== null}
                    onPress={() => handleSendToUser(user.hakaId, user.displayName)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.sendUserBtnText}>Send</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                sendSearch.length >= 2 && !sendSearching ? (
                  <Text style={styles.sendEmptyText}>No users found</Text>
                ) : null
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Store Grid (2 columns) ───────────────────────────────────────────────────

function StoreGrid({
  items,
  loading,
  onPurchase,
  insets,
}: {
  items: StoreItem[];
  loading: boolean;
  onPurchase: (item: StoreItem) => void;
  insets: { bottom: number };
}) {
  if (loading) {
    return (
      <View style={styles.skeletonWrap}>
        <StoreGridSkeleton items={6} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={2}
      showsVerticalScrollIndicator={false}
      style={styles.grid}
      contentContainerStyle={[styles.gridContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
      columnWrapperStyle={styles.gridRow}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.itemCard}
          onPress={() => onPurchase(item)}
          activeOpacity={0.7}
        >
          <StoreItemMedia source={item.image} size={130} style={styles.itemMedia} />
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.itemPriceRow}>
            <Image source={COIN_ICON} style={styles.coinIcon} contentFit="contain" />
            <Text style={styles.itemPrice}>{item.coin_cost.toLocaleString()}</Text>
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={styles.emptyCenter}>
          <Ionicons name="bag-outline" size={48} color={STORE_MUTED} />
          <Text style={styles.emptyText}>No items in this category</Text>
        </View>
      }
    />
  );
}

// ── Special ID Store Grid ────────────────────────────────────────────────────

function SpecialIdStoreGrid({
  items,
  loading,
  onPurchase,
  insets,
}: {
  items: SpecialIdItem[];
  loading: boolean;
  onPurchase: (item: SpecialIdItem) => void;
  insets: { bottom: number };
}) {
  if (loading) {
    return (
      <View style={styles.skeletonWrap}>
        <StoreGridSkeleton items={6} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={2}
      showsVerticalScrollIndicator={false}
      style={styles.grid}
      contentContainerStyle={[styles.gridContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
      columnWrapperStyle={styles.gridRow}
      renderItem={({ item }) => {
        const badgeSrc = LEVEL_BADGE_SOURCE[item.level] ?? LEVEL_BADGE_SOURCE.B;
        return (
          <TouchableOpacity
            style={styles.sidCard}
            onPress={() => onPurchase(item)}
            activeOpacity={0.7}
          >
            <View style={styles.sidBadgeWrap}>
              <StoreItemMedia source={badgeSrc} size={150} style={{ width: 150, height: 50 }} />
              <Text style={styles.sidOverlayNumber}>{item.number}</Text>
            </View>
            <View style={styles.sidDurationRow}>
              <Ionicons name="time-outline" size={14} color={STORE_MUTED} />
              <Text style={styles.sidDuration}>{item.durationDays}d 00h</Text>
            </View>
            <View style={styles.itemPriceRow}>
              <Image source={COIN_ICON} style={styles.coinIcon} contentFit="contain" />
              <Text style={styles.itemPrice}>{item.price.toLocaleString()}</Text>
            </View>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <View style={styles.emptyCenter}>
          <Ionicons name="id-card-outline" size={48} color={STORE_MUTED} />
          <Text style={styles.emptyText}>No Special IDs available</Text>
        </View>
      }
    />
  );
}

// ── Mine Grid (2 columns) ────────────────────────────────────────────────────

function MineGrid({
  items,
  loading,
  onEquip,
  insets,
  isThemeCategory = false,
  activeThemeId,
  themeByStoreItemId,
}: {
  items: UserStoreItem[];
  loading: boolean;
  onEquip: (item: UserStoreItem) => void;
  insets: { bottom: number };
  isThemeCategory?: boolean;
  activeThemeId?: string | null;
  themeByStoreItemId?: Map<string, string>;
}) {
  if (loading) {
    return (
      <View style={styles.skeletonWrap}>
        <StoreGridSkeleton items={6} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={2}
      showsVerticalScrollIndicator={false}
      style={styles.grid}
      contentContainerStyle={[styles.gridContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
      columnWrapperStyle={styles.gridRow}
      renderItem={({ item: userItem }) => {
        const appliedThemeId = isThemeCategory
          ? themeByStoreItemId?.get(userItem.item.id)
          : undefined;
        const isApplied = !!(
          isThemeCategory &&
          activeThemeId &&
          appliedThemeId &&
          appliedThemeId === activeThemeId
        );
        const showEquippedBadge = isThemeCategory ? isApplied : userItem.is_equipped;

        return (
        <TouchableOpacity
          style={styles.itemCard}
          onPress={() => onEquip(userItem)}
          activeOpacity={0.7}
        >
          <View style={styles.itemMediaWrap}>
            <StoreItemMedia source={userItem.item.image} size={130} style={styles.itemMedia} />
            {showEquippedBadge && (
              <View style={styles.equippedBadge}>
                <Ionicons name="checkmark-circle" size={18} color="#22C97A" />
              </View>
            )}
            {userItem.is_expired && (
              <View style={styles.expiredOverlay}>
                <Text style={styles.expiredText}>Expired</Text>
              </View>
            )}
          </View>
          <Text style={styles.itemName} numberOfLines={1}>{userItem.item.name}</Text>
          <View style={styles.itemPriceRow}>
            {userItem.expires_at ? (
              <Text style={[styles.itemExpiry, userItem.is_expired && styles.itemExpiryExpired]}>
                {userItem.is_expired ? '● Expired' : `● ${userItem.expires_at.slice(0, 10)}`}
              </Text>
            ) : (
              <Text style={styles.itemExpiryPerm}>● Permanent</Text>
            )}
          </View>
        </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <View style={styles.emptyCenter}>
          <Ionicons name="cube-outline" size={48} color={STORE_MUTED} />
          <Text style={styles.emptyText}>No items owned in this category</Text>
        </View>
      }
    />
  );
}

// ── My Special IDs Grid ──────────────────────────────────────────────────────

function MySpecialIdGrid({
  items,
  loading,
  onAction,
  insets,
}: {
  items: MySpecialIdItem[];
  loading: boolean;
  onAction: (inv: MySpecialIdItem) => void;
  insets: { bottom: number };
}) {
  if (loading) {
    return (
      <View style={styles.skeletonWrap}>
        <StoreGridSkeleton items={6} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={2}
      showsVerticalScrollIndicator={false}
      style={styles.grid}
      contentContainerStyle={[styles.gridContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
      columnWrapperStyle={styles.gridRow}
      renderItem={({ item: inv }) => {
        const badgeSrc = LEVEL_BADGE_SOURCE[inv.specialId.level] ?? LEVEL_BADGE_SOURCE.B;
        const isActive = inv.status === 'active';
        const isExpired = inv.status === 'expired';
        return (
          <TouchableOpacity
            style={[styles.sidCard, isExpired && { opacity: 0.5 }]}
            onPress={() => onAction(inv)}
            activeOpacity={0.7}
            disabled={isExpired}
          >
            {isActive && (
              <View style={styles.sidActiveBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#22C97A" />
              </View>
            )}
            <View style={styles.sidBadgeWrap}>
              <StoreItemMedia source={badgeSrc} size={150} style={{ width: 150, height: 50 }} />
              <Text style={styles.sidOverlayNumber}>{inv.specialId.number}</Text>
            </View>
            <View style={styles.sidDurationRow}>
              <Ionicons name="time-outline" size={14} color={isExpired ? '#FF4D4D' : STORE_MUTED} />
              <Text style={[styles.sidDuration, isExpired && { color: '#FF4D4D' }]}>
                {isExpired
                  ? 'Expired'
                  : inv.expiresAt
                    ? formatRemaining(inv.expiresAt)
                    : `${inv.specialId.durationDays}d 00h`}
              </Text>
            </View>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={
        <View style={styles.emptyCenter}>
          <Ionicons name="id-card-outline" size={48} color={STORE_MUTED} />
          <Text style={styles.emptyText}>No Special IDs in your backpack</Text>
        </View>
      }
    />
  );
}

// ── Box View ─────────────────────────────────────────────────────────────────

function BoxView() {
  return (
    <View style={styles.boxContainer}>
      <View style={styles.boxCard}>
        <View style={styles.boxItemsRow}>
          <View style={styles.boxItemPreview}>
            <Text style={styles.boxEmoji}>😈</Text>
          </View>
          <View style={styles.boxItemPreview}>
            <Text style={styles.boxEmoji}>😊</Text>
          </View>
        </View>
        <Text style={styles.boxItemName}>Princess Avatar</Text>
        <View style={styles.boxPriceRow}>
          <Text style={styles.coinIcon}>🪙</Text>
          <Text style={styles.boxPrice}>500</Text>
        </View>
      </View>

      <View style={styles.boxEmptyArea}>
        <Ionicons name="gift-outline" size={48} color={STORE_MUTED} />
        <Text style={styles.emptyText}>More mystery boxes coming soon</Text>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: STORE_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTabsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  headerTabText: {
    fontSize: 16,
    fontWeight: '400',
    color: STORE_WHITE,
  },
  headerTabTextActive: {
    fontWeight: '600',
  },
  levelDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  levelDropdownText: {
    fontSize: 14,
    fontWeight: '400',
    color: STORE_WHITE,
  },

  // ── Level filter bottom sheet (light card, dark text per no-dark-mode rule)
  filterOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.lg,
  },
  filterCancel: {
    fontSize: 16,
    fontWeight: '400',
    color: '#8A8A99',
  },
  filterTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  filterConfirm: {
    fontSize: 16,
    fontWeight: '500',
    color: '#7B4FFF',
  },
  filterOptions: {
    paddingBottom: Spacing.md,
  },
  filterOptionRow: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginBottom: 4,
  },
  filterOptionRowSelected: {
    backgroundColor: '#D9D9D9',
  },
  filterOptionText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#8A8A99',
  },
  filterOptionTextSelected: {
    color: '#1A1A1A',
    fontWeight: '600',
  },

  // ── Category tabs (scrollable, white pill for active)
  categoryScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  categoryRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    gap: Spacing.md,
    alignItems: 'center',
  },
  categoryTab: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  categoryTabActive: {
    backgroundColor: STORE_WHITE,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
  },
  categoryTabText: {
    fontSize: 14,
    fontWeight: '400',
    color: STORE_WHITE,
  },
  categoryTabTextActive: {
    color: STORE_PILL_TEXT,
    fontWeight: '600',
  },

  // ── Grid (2 columns)
  grid: {
    flex: 1,
  },
  skeletonWrap: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  gridContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  gridRow: {
    gap: 10,
    marginBottom: 12,
  },

  // ── Item card (Figma: 240px height, 20px padding, 20px radius, translucent bg)
  itemCard: {
    flex: 1,
    height: 240,
    backgroundColor: STORE_CARD_BG,
    borderRadius: 20,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
  },
  itemMedia: {
    borderRadius: Radius.md,
  },
  itemMediaWrap: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equippedBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
  },
  expiredOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  expiredText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF4D4D',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: STORE_WHITE,
    textAlign: 'center',
  },
  itemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  coinIcon: {
    width: 18,
    height: 18,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: STORE_WHITE,
  },
  itemExpiry: {
    fontSize: 12,
    color: STORE_WHITE,
    fontWeight: '500',
  },
  itemExpiryExpired: {
    color: '#FF4D4D',
  },
  itemExpiryPerm: {
    fontSize: 12,
    color: STORE_WHITE,
    fontWeight: '500',
  },

  // ── Special ID card
  sidCard: {
    flex: 1,
    backgroundColor: STORE_CARD_BG,
    borderRadius: 20,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  sidBadgeWrap: {
    width: 150,
    height: 50,
  },
  sidOverlayNumber: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 40,
    right: 8,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 50,
    fontSize: 14,
    fontWeight: '700',
    color: STORE_WHITE,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sidDurationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sidDuration: {
    fontSize: 13,
    fontWeight: '500',
    color: STORE_MUTED,
  },
  sidActiveBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 1,
  },
  sidExpiry: {
    fontSize: 10,
    color: STORE_MUTED,
  },

  // ── Empty
  emptyCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: STORE_MUTED,
  },

  // ── Box
  boxContainer: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  boxCard: {
    backgroundColor: STORE_CARD_BG,
    borderRadius: 20,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
  },
  boxItemsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  boxItemPreview: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxEmoji: {
    fontSize: 36,
  },
  boxItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: STORE_WHITE,
  },
  boxPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  boxPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: STORE_WHITE,
  },
  boxEmptyArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },

  // ── Action sheet (Buy / Send)
  actionSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  actionSheetBadge: {
    width: 180,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionSheetBadgeNum: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 50,
    right: 10,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  actionSheetPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  actionSheetBtns: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
    width: '100%',
  },
  sendBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: '#7B4FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7B4FFF',
  },
  buyBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.xl,
    backgroundColor: '#22C97A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notForSaleLabel: {
    textAlign: 'center',
    fontSize: Typography.sizes.sm,
    color: Colors.textTertiary,
    marginBottom: Spacing.sm,
    fontWeight: '600',
  },
  buyBtnDisabled: {
    backgroundColor: Colors.surfaceHighlight,
    opacity: 0.6,
  },
  buyBtnTextDisabled: {
    color: Colors.textTertiary,
  },
  buyBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ── Send-to modal
  sendModalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sendModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    maxHeight: '80%',
  },
  sendModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sendModalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  sendSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sendSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    paddingVertical: 0,
  },
  sendResultList: {
    flexGrow: 0,
  },
  sendUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  sendUserName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#111',
  },
  sendUserBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: '#7B4FFF',
  },
  sendUserBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sendEmptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
