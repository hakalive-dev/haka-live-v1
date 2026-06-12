import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { UserAvatar } from '@components/UserAvatar';

import { giftsApi } from '@api/gifts';
import { LuckyGiftBanner } from './LuckyGiftBanner';
import { LuckyGiftRankingOverlay } from './LuckyGiftRankingOverlay';
import { formatApiError } from '@api/client';
import {
  getGiftsForTab,
  type GiftPanelTabKey,
} from '@components/gifts/GiftEffectOverlay';
import { Colors, Radius, Spacing } from '@/theme';
import { StoreGridSkeleton } from '@components/Skeleton';
import type { Gift } from '@/types';

export interface GiftRecipient {
  id: string;
  displayName: string;
  avatar: string | null;
  seatPosition?: number;
  equippedFrame?: import('@/types').EquippedCosmetic | null;
}

const GIFT_IMAGES: Record<string, ReturnType<typeof require>> = {
  'gifts/86.png': require('../../../assets/gifts/86.png'),
  'gifts/93.png': require('../../../assets/gifts/93.png'),
  'gifts/116.png': require('../../../assets/gifts/116.png'),
  'gifts/121.png': require('../../../assets/gifts/121.png'),
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

type TabKey = GiftPanelTabKey;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'bag',        label: 'Bag' },
  { key: 'hot',        label: 'Hot' },
  { key: 'lucky',      label: 'Lucky' },
  { key: 'event',      label: 'Event' },
  { key: 'svip',       label: 'SVIP' },
  { key: 'customized', label: 'Customized' },
];

const QTY_PRESETS = [1, 10, 20, 50] as const;

/** Selected gift thumb — one half-cycle each way (reverse repeat = no loop seam). */
const SELECTED_GIFT_PULSE_SCALE_MAX = 1.16;
const SELECTED_GIFT_PULSE_HALF_MS = 440;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (gift: Gift, qty: number, recipient: GiftRecipient) => Promise<void>;
  coinBalance: number;
  /** Seated users (excluding room owner) that can receive gifts. */
  seatedUsers: GiftRecipient[];
  /** Optional pre-selected recipient — takes precedence if provided. */
  initialRecipientId?: string | null;
  /** Hide the mic "send-to-all" circle (e.g. DM gifting). */
  hideMic?: boolean;
  /** When set, enables the Lucky tab banner + room-scoped ranking overlay. */
  roomId?: string | null;
}

export function GiftPanel({ visible, onClose, onSend, coinBalance, seatedUsers, initialRecipientId, hideMic, roomId }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;

  const [catalogue, setCatalogue] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('bag');
  const [sending] = useState<string | null>(null); // kept for disabled-state compat, panel closes instantly
  const [qty, setQty] = useState<number>(1);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [sendToAll, setSendToAll] = useState(false);
  const [rankingOverlayVisible, setRankingOverlayVisible] = useState(false);

  // Reset/seed recipient selection whenever the panel opens.
  useEffect(() => {
    if (!visible) return;
    setSendToAll(false);
    if (initialRecipientId && seatedUsers.some((s) => s.id === initialRecipientId)) {
      setSelectedRecipientId(initialRecipientId);
    } else if (seatedUsers.length > 0) {
      setSelectedRecipientId(seatedUsers[0].id);
    } else {
      setSelectedRecipientId(null);
    }
  }, [visible, initialRecipientId, seatedUsers]);

  const selectedRecipient = seatedUsers.find((s) => s.id === selectedRecipientId) ?? null;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  // A failed fetch must clear `loading` and surface the error — otherwise the
  // panel is stuck on the skeleton with every tab empty and no way to recover.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!visible || catalogue.length > 0) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    giftsApi
      .catalogue()
      .then((data) => {
        if (cancelled) return;
        setCatalogue(data);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(formatApiError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [visible, catalogue.length, reloadKey]);

  const filtered = getGiftsForTab(catalogue, activeTab);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const selectedGift = filtered.find((g) => g.id === selectedGiftId) ?? null;

  useEffect(() => { setSelectedGiftId(null); }, [activeTab]);

  useEffect(() => {
    if (!visible || activeTab !== 'lucky') {
      setRankingOverlayVisible(false);
    }
  }, [visible, activeTab]);

  const handleSend = useCallback(
    async () => {
      if (!selectedGift) return;
      const recipients = sendToAll ? seatedUsers : (selectedRecipient ? [selectedRecipient] : []);
      if (recipients.length === 0) return;
      if (coinBalance < selectedGift.coinCost * qty * recipients.length) return;
      // Close immediately — RoomScreen handles optimistic deduction + serialized API sends
      onClose();
      for (const r of recipients) {
        await onSend(selectedGift, qty, r);
      }
    },
    [coinBalance, onSend, onClose, qty, selectedRecipient, selectedGift, sendToAll, seatedUsers],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View
        style={[
          styles.panel,
          { paddingBottom: insets.bottom + Spacing.md },
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Recipient avatars row + mic circle */}
        <View style={styles.topRow}>
          <FlatList
            horizontal
            data={seatedUsers}
            keyExtractor={(u) => u.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recipientRow}
            ListEmptyComponent={
              <Text style={styles.recipientEmptyText}>No one on a seat yet</Text>
            }
            renderItem={({ item }) => {
              const active = sendToAll || item.id === selectedRecipientId;
              return (
                <TouchableOpacity
                  style={styles.recipientItem}
                  onPress={() => {
                    setSendToAll(false);
                    setSelectedRecipientId(item.id);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.recipientChip, active && styles.recipientChipActive]}>
                    <UserAvatar
                      user={{
                        displayName: item.displayName,
                        avatar: item.avatar,
                        equippedFrame: item.equippedFrame ?? null,
                      }}
                      size={36}
                      hideFrame
                      hideBorder
                    />
                  </View>
                  {hideMic && (
                    <Text style={styles.recipientName} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
          {!hideMic && (
            <TouchableOpacity
              style={[styles.micCircle, sendToAll && styles.micCircleActive]}
              onPress={() => setSendToAll((v) => !v)}
              activeOpacity={0.8}
              disabled={seatedUsers.length === 0}
            >
              <Ionicons name="mic" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs (text-only) */}
        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'lucky' && roomId ? (
          <LuckyGiftBanner onPressRanking={() => setRankingOverlayVisible(true)} />
        ) : null}

        {/* Gift grid */}
        <View style={styles.gridWrap}>
          {loading ? (
            <StoreGridSkeleton />
          ) : loadError && catalogue.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{loadError}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => setReloadKey((k) => k + 1)}
                activeOpacity={0.8}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              numColumns={4}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={styles.gridRow}
              renderItem={({ item }) => {
                const totalCost = item.coinCost * qty;
                const affordable = coinBalance >= totalCost;
                const isSelected = selectedGiftId === item.id;
                const bundledImage = item.image ? GIFT_IMAGES[item.image] : null;
                const remoteImage =
                  !bundledImage && typeof item.image === 'string' && isHttpUrl(item.image)
                    ? item.image
                    : null;
                const thumb = bundledImage ? (
                  <Image
                    source={bundledImage}
                    style={styles.giftImage}
                    contentFit="contain"
                  />
                ) : remoteImage ? (
                  <Image
                    source={{ uri: remoteImage }}
                    style={styles.giftImage}
                    contentFit="contain"
                    cachePolicy="disk"
                  />
                ) : (
                  <View style={styles.giftIconFallback}>
                    <Ionicons name="gift" size={26} color="rgba(255,255,255,0.85)" />
                  </View>
                );

                return (
                  <GiftGridCell
                    giftId={item.id}
                    isSelected={isSelected}
                    affordable={affordable}
                    sending={!!sending}
                    onPress={() => setSelectedGiftId(item.id)}
                    thumb={thumb}
                    footer={
                      <>
                        <Text style={styles.giftName} numberOfLines={1}>{item.name}</Text>
                        <View style={styles.giftCost}>
                          <Image source={require('../../../assets/coin.png')} style={styles.giftCoinIcon} contentFit="contain" />
                          <Text style={[styles.giftCostText, !affordable && styles.giftCostDisabled]}>
                            {totalCost.toLocaleString()}
                          </Text>
                        </View>
                      </>
                    }
                  />
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No gifts in this category</Text>
                </View>
              }
            />
          )}
        </View>

        {/* Footer — balance + qty chips + Send */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.balancePill} activeOpacity={0.8}>
            <Image source={require('../../../assets/coin.png')} style={styles.coinCircleImg} contentFit="contain" />
            <Text style={styles.balanceText}>{coinBalance.toLocaleString()}</Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          <View style={styles.qtySendGroup}>
            {QTY_PRESETS.map((n) => {
              const active = qty === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.qtyChip, active && styles.qtyChipActive]}
                  onPress={() => setQty(n)}
                >
                  <Text style={[styles.qtyText, active && styles.qtyTextActive]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.sendBtn, (!selectedGift || (!sendToAll && !selectedRecipient)) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!selectedGift || (!sendToAll && !selectedRecipient) || !!sending}
              activeOpacity={0.85}
            >
              <Text style={styles.sendText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>

        {roomId ? (
          <LuckyGiftRankingOverlay
            visible={rankingOverlayVisible}
            roomId={roomId}
            onClose={() => setRankingOverlayVisible(false)}
          />
        ) : null}
      </Animated.View>
    </Modal>
  );
}

function GiftGridCell({
  giftId,
  isSelected,
  affordable,
  sending,
  onPress,
  thumb,
  footer,
}: {
  giftId: string;
  isSelected: boolean;
  affordable: boolean;
  sending: boolean;
  onPress: () => void;
  thumb: React.ReactNode;
  footer: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const pulseSelectedGift = isSelected;

  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    if (!pulseSelectedGift) {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 80, easing: Easing.out(Easing.cubic) });
      return;
    }

    scale.value = 1;
    scale.value = withRepeat(
      withTiming(SELECTED_GIFT_PULSE_SCALE_MAX, {
        duration: SELECTED_GIFT_PULSE_HALF_MS,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(scale);
    };
  }, [giftId, pulseSelectedGift, scale]);

  return (
    <TouchableOpacity
      style={[
        styles.giftItem,
        isSelected && styles.giftItemSelected,
        !affordable && styles.giftItemDisabled,
      ]}
      onPress={onPress}
      disabled={!affordable || sending}
      activeOpacity={0.75}
    >
      {pulseSelectedGift ? (
        <Reanimated.View style={[styles.selectedGiftThumbWrap, thumbAnimatedStyle]}>
          {thumb}
        </Reanimated.View>
      ) : (
        thumb
      )}
      {footer}
    </TouchableOpacity>
  );
}

const PANEL_BG = '#1A1530';

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'transparent' },
  panel: {
    backgroundColor: PANEL_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    maxHeight: '60%',
    minHeight: '50%',
    position: 'relative',
  },

  // Top: avatars + mic circle (pill container)
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
  },
  recipientRow: {
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
    alignItems: 'center',
  },
  recipientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: Spacing.sm,
  },
  recipientName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 140,
  },
  recipientChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'visible',
  },
  recipientChipActive: { borderColor: '#22C97A' },
  recipientAvatar: { width: '100%', height: '100%', borderRadius: 18 },
  recipientAvatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  recipientEmptyText: {
    fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic',
    paddingLeft: Spacing.xs,
  },
  micCircle: {
    marginLeft: 'auto',
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  micCircleActive: {
    borderColor: '#22C97A',
    backgroundColor: 'rgba(34,201,122,0.2)',
  },

  // Tabs — text only
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  tab: { paddingVertical: 4 },
  tabText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: { color: '#FFFFFF', fontWeight: '700' },

  // Grid
  gridWrap: { flex: 1 },
  grid: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  gridRow: { gap: Spacing.sm },
  giftItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    gap: 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  giftItemSelected: {
    backgroundColor: 'rgba(123,79,255,0.15)',
    borderColor: Colors.primary,
  },
  giftItemDisabled: { opacity: 0.45 },
  giftIconFallback: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftImage: { width: 40, height: 40 },
  selectedGiftThumbWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  giftName: {
    color: '#FFFFFF', fontSize: 10, fontWeight: '500', textAlign: 'center',
  },
  giftCost: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  giftCoinIcon: { width: 11, height: 11 },
  coinCircleImg: { width: 22, height: 22 },
  giftCostText: { color: Colors.coin, fontSize: 10, fontWeight: '600' },
  giftCostDisabled: { color: 'rgba(255,255,255,0.4)' },
  emptyBox: { height: 80, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  retryBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  retryText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  balancePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingRight: 4,
  },
  coinCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.coin,
    alignItems: 'center', justifyContent: 'center',
  },
  balanceText: {
    color: '#FFFFFF', fontSize: 14, fontWeight: '700',
  },
  qtySendGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingLeft: 6,
    paddingVertical: 3,
    paddingRight: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
  },
  qtyChip: {
    minWidth: 30, height: 26,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyChipActive: { backgroundColor: Colors.primary },
  qtyText: {
    color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600',
  },
  qtyTextActive: { color: '#FFFFFF', fontWeight: '700' },
  sendBtn: {
    paddingHorizontal: Spacing.lg,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
