import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardStickyFooter } from '@components/keyboard';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import EmojiPicker from 'rn-emoji-keyboard';
import { useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';

import { chatApi } from '@api/chat';
import { giftsApi } from '@api/gifts';
import { walletApi } from '@api/wallet';
import { DmMessageRow, dmMessageBubbleStyles } from '@components/chat/DmMessageRow';
import { DmDeletedBubble } from '@components/chat/DmDeletedBubble';
import { DmForwardPicker } from '@components/chat/DmForwardPicker';
import { DmMessageActionSheet } from '@components/chat/DmMessageActionSheet';
import { DmImageBubble } from '@components/chat/DmImageBubble';
import { DmGiftMessageBubble } from '@components/gifts/DmGiftMessageBubble';
import { DmGiftPopEffect, type DmGiftPopItem } from '@components/gifts/DmGiftPopEffect';
import {
  GiftEffectOverlay,
  isBagGiftCategory,
  mergeDmGiftPopQueueSorted,
  normalizeGiftCoinCost,
} from '@components/gifts/GiftEffectOverlay';
import { useGiftEffectPlayback } from '@hooks/useGiftEffectPlayback';
import { invalidateUserLevels } from '@hooks/queries/useLevelQueries';
import { invalidateChatUnreadQueries, onOutboundDmSent } from '@hooks/useDMConnection';
import { useDmMessageActions } from '@hooks/useDmMessageActions';
import { GiftPanel, type GiftRecipient } from './GiftPanel';
import { PhotoViewerModal } from './PhotoViewerModal';
import { DMPhotoShareOverlay } from '../chat/DMPhotoShareOverlay';
import type { RootState } from '@store/index';
import { Colors, Radius, Spacing } from '@/theme';
import { UserAvatar } from '@components/UserAvatar';
import type { DMConversation, DirectMessage, Gift } from '@/types';

const FILTER_TABS = ['All', 'Unread', 'Familiar Faces'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

interface Props {
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const diffDays = (Date.now() - d.getTime()) / 86_400_000;
  if (diffDays < 1) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diffDays < 2) return 'Yesterday';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
}

function shouldShowTimestamp(messages: DirectMessage[], index: number): boolean {
  if (index === 0) return true;
  const curr = new Date(messages[index].createdAt);
  const prev = new Date(messages[index - 1].createdAt);
  // Show timestamp if more than 5 minutes apart
  return curr.getTime() - prev.getTime() > 5 * 60 * 1000;
}

export function InboxOverlay({ visible, onClose, currentUserId }: Props) {
  const queryClient = useQueryClient();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('All');
  const [active, setActive] = useState<DMConversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [giftVisible, setGiftVisible] = useState(false);
  const [coinBalance, setCoinBalance] = useState(0);
  const [photoShareVisible, setPhotoShareVisible] = useState(false);
  const [photoShareAsset, setPhotoShareAsset] = useState<{
    uri: string;
    width: number;
    height: number;
    mimeType?: string;
    fileName?: string;
  } | null>(null);
  const [photoViewerUri, setPhotoViewerUri] = useState<string | null>(null);
  const [popQueue, setPopQueue] = useState<DmGiftPopItem[]>([]);
  const activePop = popQueue[0] ?? null;
  const listRef = useRef<FlatList<DirectMessage>>(null);
  const giftCatalogueRef = useRef<Gift[]>([]);

  const { specialEffect, advanceGiftEffectQueue, playGiftEffect } = useGiftEffectPlayback();

  const {
    actionSheetVisible,
    forwardPickerVisible,
    availability,
    openActions,
    closeActionSheet,
    onActionSelect,
    setForwardPickerVisible,
    handleForwardSelect,
  } = useDmMessageActions({
    currentUserId: currentUserId ?? currentUser?.id,
    threadPartnerId: active?.otherUser.id,
    messages,
    setMessages,
  });

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    chatApi.getConversations()
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [visible]);

  useEffect(() => {
    giftsApi
      .catalogue()
      .then((data) => {
        giftCatalogueRef.current = data;
      })
      .catch(() => {});
  }, []);

  const filtered = conversations.filter((c) => {
    if (!c.otherUser) return false;
    if (filterTab === 'Unread') return c.unreadCount > 0;
    if (filterTab === 'Familiar Faces') return c.isFamiliar === true;
    return true;
  });

  const patchLocalConversations = useCallback(
    (msg: DirectMessage) => {
      const uid = currentUserId ?? currentUser?.id;
      if (!uid) return;
      const peerId = msg.sender.id === uid ? msg.recipient.id : msg.sender.id;
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.otherUser.id === peerId);
        if (idx >= 0) {
          const updated: DMConversation = {
            ...prev[idx],
            lastMessage: msg,
            unreadCount: 0,
          };
          const rest = prev.filter((_, i) => i !== idx);
          return [updated, ...rest].sort((a, b) => {
            const aTime = a.lastMessage?.createdAt
              ? new Date(a.lastMessage.createdAt).getTime()
              : 0;
            const bTime = b.lastMessage?.createdAt
              ? new Date(b.lastMessage.createdAt).getTime()
              : 0;
            return bTime - aTime;
          });
        }
        const otherUser = msg.sender.id === uid ? msg.recipient : msg.sender;
        const newRow: DMConversation = {
          otherUser,
          lastMessage: msg,
          unreadCount: 0,
          isFollowing: false,
          isFamiliar: false,
        };
        return [newRow, ...prev];
      });
      setActive((prev) =>
        prev && prev.otherUser.id === peerId
          ? { ...prev, lastMessage: msg, unreadCount: 0 }
          : prev,
      );
    },
    [currentUserId, currentUser?.id],
  );

  const notifyOutboundDm = useCallback(
    (msg: DirectMessage) => {
      const uid = currentUserId ?? currentUser?.id;
      if (!uid) return;
      onOutboundDmSent(queryClient, msg, uid);
      patchLocalConversations(msg);
    },
    [currentUserId, currentUser?.id, queryClient, patchLocalConversations],
  );

  const openThread = useCallback(async (c: DMConversation) => {
    setActive(c);
    setMessages([]);
    setThreadLoading(true);
    try {
      const res = await chatApi.getDMMessages(c.otherUser.id);
      setMessages([...res.items].reverse());
      chatApi
        .markAsRead(c.otherUser.id)
        .then(() => invalidateChatUnreadQueries(queryClient))
        .catch(() => {});
    } catch {}
    finally { setThreadLoading(false); }
  }, [queryClient]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || !active || sending) return;
    setSending(true);
    try {
      const msg = await chatApi.sendDM(active.otherUser.id, content);
      setMessages((prev) => [...prev, msg]);
      setDraft('');
      notifyOutboundDm(msg);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch {}
    finally { setSending(false); }
  }, [draft, active, sending, notifyOutboundDm]);

  const openEmojiPicker = useCallback(() => {
    Keyboard.dismiss();
    setEmojiOpen(true);
  }, []);

  const handleEmojiSelected = useCallback(
    ({ emoji }: { emoji: string }) => {
      setDraft((prev) => {
        const start = Math.min(selection.start, prev.length);
        const end = Math.min(selection.end, prev.length);
        const next = prev.slice(0, start) + emoji + prev.slice(end);
        const caret = start + emoji.length;
        setSelection({ start: caret, end: caret });
        return next;
      });
    },
    [selection.start, selection.end],
  );

  const handleSelectionChange = useCallback(
    (e: { nativeEvent: { selection: { start: number; end: number } } }) => {
      setSelection(e.nativeEvent.selection);
    },
    [],
  );

  const launchPicker = useCallback(
    async (source: 'camera' | 'library') => {
      try {
        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission needed', 'Allow camera access to take a photo.');
            return;
          }
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission needed', 'Allow photo access to share a photo.');
            return;
          }
        }

        const picked =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.85,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.85,
                ...(Platform.OS === 'ios' && {
                  presentationStyle:
                    ImagePicker.UIImagePickerPresentationStyle.OVER_FULL_SCREEN,
                }),
              });

        if (picked.canceled || !picked.assets?.[0]) return;
        const a = picked.assets[0];
        setPhotoShareAsset({
          uri: a.uri,
          width: a.width ?? 1,
          height: a.height ?? 1,
          mimeType: a.mimeType,
          fileName: a.fileName ?? undefined,
        });
        setPhotoShareVisible(true);
      } catch (err: unknown) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to open photo picker');
      }
    },
    [],
  );

  const handleAttachPress = useCallback(() => {
    Keyboard.dismiss();
    Alert.alert('Share Photo', undefined, [
      { text: 'Take Photo', onPress: () => launchPicker('camera') },
      { text: 'Choose from Library', onPress: () => launchPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [launchPicker]);

  const openGifts = useCallback(async () => {
    try {
      const bal = await walletApi.getBalance();
      setCoinBalance(bal.coinBalance ?? 0);
    } catch {}
    setGiftVisible(true);
  }, []);

  const enqueuePop = useCallback((gift: Gift, qty: number) => {
    const playCount = Math.max(1, Math.min(50, Math.floor(qty)));
    const baseId = Date.now();
    const coinCost = normalizeGiftCoinCost(gift);
    const entries: DmGiftPopItem[] = Array.from({ length: playCount }, (_, i) => ({
      id: `${baseId}-${i}-${Math.random().toString(36).slice(2, 9)}`,
      giftIcon: gift.icon,
      giftImage: gift.image ?? null,
      coinCost,
    }));
    setPopQueue((prev) => mergeDmGiftPopQueueSorted(prev, entries));
  }, []);

  const advancePop = useCallback(() => {
    setPopQueue((prev) => (prev.length > 0 ? prev.slice(1) : prev));
  }, []);

  const playGiftAnimation = useCallback(
    (gift: Gift, qty: number, senderName: string) => {
      const hasSvga =
        typeof gift.svgaAsset === 'string' && gift.svgaAsset.trim().length > 0;
      if (isBagGiftCategory(gift.category) && !hasSvga) {
        enqueuePop(gift, qty);
      } else {
        playGiftEffect(gift, qty, senderName);
      }
    },
    [enqueuePop, playGiftEffect],
  );

  const handleSendGift = useCallback(
    async (gift: Gift, qty: number, recipient: GiftRecipient) => {
      playGiftAnimation(gift, qty, currentUser?.displayName ?? 'You');
      try {
        const dm = await chatApi.sendGiftDM(recipient.id, gift.id, qty);
        setMessages((prev) => [...prev, dm]);
        setCoinBalance((b) => Math.max(0, b - gift.coinCost * qty));
        invalidateUserLevels(currentUser?.id, recipient.id);
        notifyOutboundDm(dm);
      } catch {}
    },
    [playGiftAnimation, currentUser?.displayName, currentUser?.id, notifyOutboundDm],
  );

  const handleClose = () => {
    setActive(null);
    setMessages([]);
    setDraft('');
    onClose();
  };

  const giftRecipient: GiftRecipient | null = active
    ? {
        id: active.otherUser.id,
        displayName: active.otherUser.displayName,
        avatar: active.otherUser.avatar ?? null,
      }
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdropTap} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.sheetBody}>
            <View style={styles.header}>
              {active ? (
                <TouchableOpacity onPress={() => setActive(null)} style={styles.headerBtn}>
                  <Ionicons name="chevron-back" size={22} color="#000" />
                </TouchableOpacity>
              ) : <View style={styles.headerBtn} />}
              <Text style={styles.headerTitle} numberOfLines={1}>
                {active ? active.otherUser.displayName : 'Inbox'}
              </Text>
              <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
                <Ionicons name="close" size={22} color="#000" />
              </TouchableOpacity>
            </View>

            {!active ? (
              <View style={styles.listFlex}>
                <View style={styles.filterRow}>
                  {FILTER_TABS.map((tab) => (
                    <TouchableOpacity key={tab} onPress={() => setFilterTab(tab)}>
                      <Text style={[styles.filterTab, filterTab === tab && styles.filterTabActive]}>
                        {tab}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <FlatList
                    style={styles.listFlex}
                    data={filtered}
                    keyExtractor={(c, i) => `${c.otherUser.id}-${i}`}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      <View style={styles.center}>
                        <Ionicons name="chatbubbles-outline" size={44} color="#DDD" />
                        <Text style={styles.emptyTitle}>No messages</Text>
                      </View>
                    }
                    renderItem={({ item }) => (
                      <TouchableOpacity style={styles.row} onPress={() => openThread(item)} activeOpacity={0.7}>
                        <View style={styles.avatarWrap}>
                          <UserAvatar
                            user={{
                              displayName: item.otherUser.displayName,
                              avatar: item.otherUser.avatar,
                            }}
                            hideFrame
                            size={52}
                          />
                          {item.isOnline && <View style={styles.onlineDot} />}
                        </View>
                        <View style={styles.rowBody}>
                          <View style={styles.rowTop}>
                            <Text style={styles.rowName} numberOfLines={1}>{item.otherUser.displayName}</Text>
                            {item.lastMessage && (
                              <Text style={styles.rowTime}>{formatTime(item.lastMessage.createdAt)}</Text>
                            )}
                          </View>
                          <View style={styles.rowBottom}>
                            <Text
                              style={[styles.rowPreview, item.unreadCount > 0 && styles.rowPreviewUnread]}
                              numberOfLines={1}
                            >
                              {item.lastMessage?.content ?? 'No messages yet'}
                            </Text>
                            {item.unreadCount > 0 && (
                              <View style={styles.unreadBadge}>
                                <Text style={styles.unreadText}>{item.unreadCount}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    )}
                  />
              </View>
            ) : (
              <View style={styles.listFlex}>
                <FlatList
                    ref={listRef}
                    style={styles.listFlex}
                    data={messages}
                    keyExtractor={(m) => m.id}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={[dmMessageBubbleStyles.listContent, styles.threadListContent]}
                    ListEmptyComponent={<Text style={styles.emptySubtitle}>Send the first message.</Text>}
                    onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                    renderItem={({ item, index }) => {
                      const isMine = item.sender.id === currentUserId;
                      const showTime = shouldShowTimestamp(messages, index);
                      const mineUser = {
                        displayName: currentUser?.displayName ?? 'You',
                        avatar: currentUser?.avatar ?? null,
                      };
                      const theirsUser = {
                        displayName: item.sender.displayName,
                        avatar: item.sender.avatar ?? null,
                      };

                      const bubbleContent = item.isDeleted ? (
                        <DmDeletedBubble isMine={isMine} />
                      ) : item.messageType === 'gift' ? (
                          <DmGiftMessageBubble
                            giftIcon={item.giftIcon}
                            giftImage={item.giftImage}
                            giftName={item.giftName}
                            giftQty={item.giftQty ?? 1}
                            isMine={isMine}
                          />
                        ) : item.messageType === 'image' && item.mediaUrl ? (
                          <DmImageBubble
                            mediaUrl={item.mediaUrl}
                            caption={item.content}
                            isMine={isMine}
                            onPress={() => setPhotoViewerUri(item.mediaUrl ?? null)}
                          />
                        ) : (
                          <View
                            style={[
                              dmMessageBubbleStyles.bubble,
                              isMine
                                ? dmMessageBubbleStyles.bubbleMine
                                : dmMessageBubbleStyles.bubbleTheirs,
                            ]}
                          >
                            <Text
                              style={[
                                dmMessageBubbleStyles.bubbleText,
                                isMine
                                  ? dmMessageBubbleStyles.bubbleTextMine
                                  : dmMessageBubbleStyles.bubbleTextTheirs,
                              ]}
                            >
                              {item.content}
                            </Text>
                          </View>
                        );

                      return (
                        <View>
                          {showTime && (
                            <Text style={styles.timestampSeparator}>
                              {formatMessageTime(item.createdAt)}
                            </Text>
                          )}
                          <DmMessageRow
                            isMine={isMine}
                            mineUser={mineUser}
                            theirsUser={theirsUser}
                            isRead={item.isRead}
                            onBubbleLongPress={item.isDeleted ? undefined : () => openActions(item)}
                          >
                            {bubbleContent}
                          </DmMessageRow>
                        </View>
                      );
                    }}
                  />
                <KeyboardStickyFooter>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      placeholder="Message"
                      placeholderTextColor="#999"
                      value={draft}
                      onChangeText={setDraft}
                      onSelectionChange={handleSelectionChange}
                      onSubmitEditing={send}
                      returnKeyType="send"
                    />
                    <TouchableOpacity hitSlop={8} style={styles.inputIcon} onPress={openEmojiPicker}>
                      <Ionicons name="happy-outline" size={22} color="#999" />
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={8} style={styles.inputIcon} onPress={handleAttachPress}>
                      <Ionicons name="attach" size={22} color="#999" />
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={8} style={styles.inputIcon} onPress={openGifts}>
                      <Ionicons name="gift" size={22} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={send} disabled={!draft.trim() || sending} style={styles.sendBtn}>
                      <Ionicons name="send" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </KeyboardStickyFooter>
              </View>
            )}
          </View>

          {activePop ? (
            <DmGiftPopEffect item={activePop} onComplete={advancePop} />
          ) : null}
          <GiftEffectOverlay effect={specialEffect} onComplete={advanceGiftEffectQueue} />
        </View>
      </View>

      {giftRecipient ? (
        <GiftPanel
          visible={giftVisible}
          onClose={() => setGiftVisible(false)}
          onSend={handleSendGift}
          coinBalance={coinBalance}
          seatedUsers={[giftRecipient]}
          initialRecipientId={giftRecipient.id}
          hideMic
        />
      ) : null}

      <EmojiPicker
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onEmojiSelected={handleEmojiSelected}
        enableRecentlyUsed
        enableSearchBar
      />

      {active ? (
        <DMPhotoShareOverlay
          visible={photoShareVisible}
          asset={photoShareAsset}
          userId={active.otherUser.id}
          onClose={() => {
            setPhotoShareVisible(false);
            setPhotoShareAsset(null);
          }}
          onSent={(dm) => {
            setMessages((prev) => (prev.some((m) => m.id === dm.id) ? prev : [...prev, dm]));
            notifyOutboundDm(dm);
          }}
        />
      ) : null}

      <PhotoViewerModal
        visible={!!photoViewerUri}
        uri={photoViewerUri}
        onClose={() => setPhotoViewerUri(null)}
      />

      <DmMessageActionSheet
        visible={actionSheetVisible}
        availability={availability}
        onClose={closeActionSheet}
        onSelect={onActionSelect}
      />
      <DmForwardPicker
        visible={forwardPickerVisible}
        excludeUserId={active?.otherUser.id}
        onClose={() => setForwardPickerVisible(false)}
        onSelect={(recipientId) => void handleForwardSelect(recipientId)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdropTap: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    height: '85%',
    overflow: 'hidden',
  },
  sheetBody: { flex: 1 },
  listFlex: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  headerBtn: { width: 32, alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', color: '#000', fontSize: 17, fontWeight: '700' },

  filterRow: {
    flexDirection: 'row', gap: Spacing.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  filterTab: { fontSize: 13, fontWeight: '500', color: '#999', paddingBottom: Spacing.sm },
  filterTabActive: { fontWeight: '600', color: '#000', borderBottomWidth: 2, borderBottomColor: '#000' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: Spacing.sm },
  emptyTitle: { color: '#666', fontSize: 15, fontWeight: '600' },
  emptySubtitle: { color: '#999', fontSize: 13, textAlign: 'center', marginTop: Spacing.xl },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md,
  },
  avatarWrap: { width: 48, height: 48 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#666', fontSize: 18, fontWeight: '600' },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#22C97A', borderWidth: 2, borderColor: '#FFF',
  },
  rowBody: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { fontSize: 14, fontWeight: '600', color: '#000', flex: 1 },
  rowTime: { fontSize: 11, color: '#999', marginLeft: Spacing.sm },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowPreview: { fontSize: 13, color: '#999', flex: 1 },
  rowPreviewUnread: { color: '#000', fontWeight: '500' },
  unreadBadge: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    minWidth: 18, height: 18, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  threadListContent: {
    paddingBottom: 72,
  },
  timestampSeparator: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginVertical: Spacing.xs,
  },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
    gap: Spacing.sm,
  },
  input: {
    flex: 1, backgroundColor: '#F5F5F5',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    color: '#000', fontSize: 14,
  },
  inputIcon: {
    height: 38,
    justifyContent: 'center',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
