import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useChatInboxQuery } from "@hooks/queries/useChatInboxQuery";
import { useRefetchOnFocusIfStale } from "@hooks/useRefetchOnFocusIfStale";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";

import { chatApi } from "@api/chat";
import { prefetchDMMessages } from "@api/prefetch";
import { Colors, Radius, Spacing } from "@/theme";
import { mainTabContentPaddingBottom } from "../../constants/layout";
import { ListRowSkeleton } from "@components/Skeleton";
import { UserAvatar } from "@components/UserAvatar";
import { useDMConnection } from "@hooks/useDMConnection";
import type {
  DMConversation,
  RoomUser,
  TeamAnnouncementPayload,
} from "@/types";
import type { RootStackParamList } from "@navigation/types";
import { HAKA_LOGO_MARK } from "@/constants/app-logo";
import {
  HAKA_TEAM_USER_ID,
  isHakaTeamUserId,
  HAKA_OFFICIAL_BADGE,
} from "@/constants/haka-team";
import {
  isWithdrawalMessageUserId,
  WITHDRAWAL_MESSAGE_AVATAR,
} from "@/constants/withdrawal-message";
import { dmInboxPreview } from "@/utils/dmContent";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function parseAgencyDmPayload(
  content: string,
): ({ kind: string } & Record<string, unknown>) | null {
  try {
    const o = JSON.parse(content) as { kind?: string } & Record<
      string,
      unknown
    >;
    if (o?.kind === "agent_application" || o?.kind === "sub_agent_invite")
      return o as { kind: string } & Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function formatConversationPreview(
  lastMessage: DMConversation["lastMessage"],
): string {
  if (!lastMessage) return "No messages yet";

  const structured = dmInboxPreview(lastMessage.messageType, lastMessage.content);
  if (structured) return structured;

  if (lastMessage.messageType === "gift") {
    const qty = lastMessage.giftQty ?? 1;
    return `Sent ${lastMessage.giftName || "Gift"} x${qty}`;
  }

  if (lastMessage.messageType === "agent_application") {
    const p = parseAgencyDmPayload(lastMessage.content);
    const name =
      typeof p?.applicantName === "string" ? p.applicantName : "Someone";
    const proposed = typeof p?.proposedName === "string" ? p.proposedName : "";
    return proposed
      ? `${name} applied: ${proposed}`
      : `${name} sent an agent application`;
  }

  if (lastMessage.messageType === "sub_agent_invite") {
    const p = parseAgencyDmPayload(lastMessage.content);
    const inviter =
      typeof p?.inviterName === "string" ? p.inviterName : "An agency";
    const agency = typeof p?.agencyName === "string" ? p.agencyName : "";
    return agency
      ? `${inviter} invited you: ${agency}`
      : `${inviter} sent an agency invite`;
  }

  // Default: text (and any other types)
  return lastMessage.content || "No messages yet";
}

/** Ensures Haka Team appears even if the API omits it (e.g. stale deploy). Real API also injects this row. */
function ensureHakaTeamInInbox(convos: DMConversation[]): DMConversation[] {
  const has = convos.some((c) => c.otherUser?.id === HAKA_TEAM_USER_ID);
  if (has) return convos;
  const otherUser: RoomUser = {
    id: HAKA_TEAM_USER_ID,
    username: null,
    displayName: "Haka Team",
    avatar: "",
    hakaId: null,
    profileHidden: true,
  };
  const row: DMConversation = {
    otherUser,
    lastMessage: null,
    unreadCount: 0,
    isFollowing: false,
    isFamiliar: false,
  };
  return [row, ...convos];
}

const HEADER_TABS = ["Inbox", "Friends"] as const;
type HeaderTab = (typeof HEADER_TABS)[number];

const FILTER_TABS = ["All", "Unread", "Familiar Faces"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays < 2) {
    return "Yesterday";
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatGiftCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${Math.round(count / 1000)}k`;
  return count.toString();
}

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { teamAnnouncementRevision } = useDMConnection();
  const [headerTab, setHeaderTab] = useState<HeaderTab>("Inbox");
  const [filterTab, setFilterTab] = useState<FilterTab>("All");
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [friendConversations, setFriendConversations] = useState<
    DMConversation[]
  >([]);
  const [onlineFriends, setOnlineFriends] = useState<
    Array<{
      id: string;
      displayName: string;
      avatar: string | null;
      isOnline: boolean;
      equippedFrame?: import("@/types").EquippedCosmetic | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamAnnouncement, setTeamAnnouncement] =
    useState<TeamAnnouncementPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const inboxQuery = useChatInboxQuery();
  useRefetchOnFocusIfStale(
    () => inboxQuery.refetch(),
    inboxQuery.isStale,
    !inboxQuery.isLoading,
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void inboxQuery.refetch().finally(() => setRefreshing(false));
  }, [inboxQuery]);

  useEffect(() => {
    if (!inboxQuery.data) return;
    setConversations(inboxQuery.data.conversations);
    setFriendConversations(inboxQuery.data.friendConversations);
    setOnlineFriends(inboxQuery.data.onlineFriends);
    setTeamAnnouncement(inboxQuery.data.teamAnnouncement);
    setError(null);
    setLoading(false);
  }, [inboxQuery.data]);

  useEffect(() => {
    if (inboxQuery.isError) {
      setError(
        inboxQuery.error instanceof Error
          ? inboxQuery.error.message
          : "Failed to load messages",
      );
      setLoading(false);
    }
  }, [inboxQuery.isError, inboxQuery.error]);

  useEffect(() => {
    if (teamAnnouncementRevision === 0) return;
    chatApi
      .getTeamAnnouncement()
      .then((r) => setTeamAnnouncement(r.announcement))
      .catch(() => {});
  }, [teamAnnouncementRevision]);

  // Friends tab uses its own server-filtered list; Inbox uses all conversations
  const activeConversations =
    headerTab === "Friends" ? friendConversations : conversations;

  // Apply secondary filter tabs (Inbox only — Friends tab data is already scoped)
  const filteredConversations = activeConversations.filter((c) => {
    if (!c.otherUser) return false;
    if (headerTab === "Inbox" && filterTab === "Unread")
      return c.unreadCount > 0;
    if (headerTab === "Inbox" && filterTab === "Familiar Faces")
      return c.isFamiliar === true;
    return true;
  });

  const visibleOnlineFriends = onlineFriends.filter((f) => f.isOnline);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header with Inbox/Friends tabs */}
      <View style={styles.header}>
        <View style={styles.headerTabsRow}>
          {HEADER_TABS.map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setHeaderTab(tab)}>
              <Text
                style={[
                  styles.headerTab,
                  headerTab === tab && styles.headerTabActive,
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          hitSlop={8}
          onPress={() => navigation.navigate("Notifications")}
        >
          <Ionicons name="notifications-outline" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ListRowSkeleton rows={5} />
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons
            name="alert-circle-outline"
            size={40}
            color={Colors.danger}
          />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void inboxQuery.refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item, index) => `${item.otherUser.id}-${index}`}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: mainTabContentPaddingBottom(insets, Spacing.xl) },
          ]}
          ListHeaderComponent={
            <>
              {/* Online friends story circles */}
              {visibleOnlineFriends.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.storiesRow}
                >
                  {visibleOnlineFriends.map((friend, idx) => (
                    <TouchableOpacity
                      key={`${friend.id}-${idx}`}
                      style={styles.storyItem}
                      onPress={() => {
                        prefetchDMMessages(friend.id);
                        navigation.navigate("DMConversation", {
                          userId: friend.id,
                          displayName: friend.displayName,
                        });
                      }}
                    >
                      <View style={styles.storyAvatarWrap}>
                        <UserAvatar
                          user={{
                            displayName: friend.displayName,
                            avatar: friend.avatar,
                            equippedFrame: friend.equippedFrame ?? null,
                          }}
                          hideFrame
                          size={56}
                        />
                        {friend.isOnline && (
                          <View style={styles.storyOnlineDot} />
                        )}
                      </View>
                      <Text style={styles.storyName} numberOfLines={1}>
                        {friend.displayName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Filter tabs */}
              <View style={styles.filterRow}>
                <View style={styles.filterTabs}>
                  {FILTER_TABS.map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      onPress={() => setFilterTab(tab)}
                    >
                      <Text
                        style={[
                          styles.filterTab,
                          filterTab === tab && styles.filterTabActive,
                        ]}
                      >
                        {tab}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity hitSlop={8}>
                  <Ionicons name="options-outline" size={20} color="#000" />
                </TouchableOpacity>
              </View>
            </>
          }
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              teamAnnouncement={teamAnnouncement}
              onPress={() => {
                prefetchDMMessages(item.otherUser.id);
                navigation.navigate("DMConversation", {
                  userId: item.otherUser.id,
                  displayName: item.otherUser.displayName,
                });
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="chatbubbles-outline" size={52} color="#DDD" />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>
                Visit someone's profile to start a conversation.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function ConversationRow({
  conversation,
  teamAnnouncement,
  onPress,
}: {
  conversation: DMConversation;
  teamAnnouncement: TeamAnnouncementPayload | null;
  onPress: () => void;
}) {
  const {
    otherUser,
    lastMessage,
    unreadCount,
    isOnline,
    level,
    levelColor,
    isOfficial,
    giftCount,
  } = conversation;
  if (!otherUser) return null;

  const isHakaTeam = isHakaTeamUserId(otherUser.id);
  const isWithdrawalMsg = isWithdrawalMessageUserId(otherUser.id);
  const dmPreview = formatConversationPreview(lastMessage);
  /** Inbox only knows real DMs; synthetic announcement lives in thread — fill preview when DM row is empty. */
  const rowPreview =
    isHakaTeam && teamAnnouncement?.preview && dmPreview === "No messages yet"
      ? teamAnnouncement.preview
      : dmPreview;
  const rowTimeIso =
    isHakaTeam &&
    teamAnnouncement?.publishedAt &&
    dmPreview === "No messages yet"
      ? teamAnnouncement.publishedAt
      : lastMessage?.createdAt;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar with online dot */}
      <View style={styles.avatarWrap}>
        <UserAvatar
          user={{
            displayName: otherUser.displayName,
            avatar: otherUser.avatar,
            equippedFrame: otherUser.equippedFrame ?? null,
          }}
          localAvatar={
            isHakaTeam
              ? HAKA_LOGO_MARK
              : isWithdrawalMsg
                ? WITHDRAWAL_MESSAGE_AVATAR
                : undefined
          }
          hideFrame
          size={52}
        />
        {isOnline && <View style={styles.onlineDot} />}
      </View>

      {/* Content */}
      <View style={styles.rowBody}>
        {/* Name row */}
        <View style={styles.rowTop}>
          <View style={styles.nameRow}>
            <Text style={styles.rowName} numberOfLines={1}>
              {otherUser.displayName}
            </Text>
            {isHakaTeam && (
              <Image
                source={HAKA_OFFICIAL_BADGE}
                style={styles.hakaOfficialPill}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            )}
            {/* Level badge */}
            {level != null && (
              <View
                style={[
                  styles.levelBadge,
                  { backgroundColor: levelColor ?? "#22C97A" },
                ]}
              >
                <Text style={styles.levelText}>{level}</Text>
              </View>
            )}
            {/* Official badge */}
            {isOfficial && (
              <View style={styles.officialBadge}>
                <Text style={styles.officialText}>All Official</Text>
              </View>
            )}
          </View>
          <View style={styles.timeRow}>
            {/* Gift count */}
            {giftCount != null && giftCount > 0 && (
              <View style={styles.giftRow}>
                <Ionicons name="heart" size={12} color="#FF4D4D" />
                <Text style={styles.giftText}>
                  {formatGiftCount(giftCount)}
                </Text>
              </View>
            )}
            {rowTimeIso ? (
              <Text style={styles.rowTime}>{formatTime(rowTimeIso)}</Text>
            ) : null}
          </View>
        </View>

        {/* Message preview row */}
        <View style={styles.rowBottom}>
          <View style={styles.previewRow}>
            {/* Read receipt icon for sent messages */}
            {lastMessage && lastMessage.sender.id !== otherUser.id && (
              <Ionicons
                name={lastMessage.isRead ? "checkmark-done" : "checkmark"}
                size={14}
                color={lastMessage.isRead ? "#22C97A" : "#999"}
                style={{ marginRight: 4 }}
              />
            )}
            <Text
              style={[
                styles.rowPreview,
                unreadCount > 0 && styles.rowPreviewUnread,
              ]}
              numberOfLines={1}
            >
              {rowPreview}
            </Text>
          </View>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTabsRow: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  headerTab: {
    fontSize: 17,
    fontWeight: "500",
    color: "#999",
  },
  headerTabActive: {
    fontWeight: "700",
    color: "#000",
  },

  // Stories
  storiesRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.xl,
  },
  storyItem: {
    alignItems: "center",
    width: 60,
  },
  storyAvatarWrap: {
    width: 56,
    height: 56,
    marginBottom: Spacing.xs,
  },
  storyAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },
  storyOnlineDot: {
    position: "absolute",
    bottom: 2,
    left: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22C97A",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  storyName: {
    fontSize: 11,
    color: "#000",
    textAlign: "center",
  },

  // Filter tabs
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  filterTabs: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  filterTab: {
    fontSize: 13,
    fontWeight: "500",
    color: "#999",
    paddingBottom: Spacing.sm,
  },
  filterTabActive: {
    fontWeight: "600",
    color: "#000",
    borderBottomWidth: 2,
    borderBottomColor: "#000",
  },

  listContent: {},

  // Conversation row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  avatarWrap: {
    width: 52,
    height: 52,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    backgroundColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#666",
    fontSize: 18,
    fontWeight: "600",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22C97A",
    borderWidth: 2,
    borderColor: "#FFF",
  },

  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flex: 1,
  },
  rowName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
    maxWidth: "60%",
  },

  // Level badge
  levelBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 28,
    alignItems: "center",
  },
  levelText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFF",
  },

  // Official badge
  officialBadge: {
    backgroundColor: "#FF4D4D",
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  officialText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFF",
  },

  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rowTime: {
    fontSize: 11,
    color: "#999",
  },

  // Gift
  giftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  giftText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FF4D4D",
  },

  // Message preview
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowPreview: {
    fontSize: 13,
    color: "#999",
    flex: 1,
  },
  rowPreviewUnread: {
    color: "#000",
    fontWeight: "500",
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },

  // States
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
  },
  errorText: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
  },
  retryText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyTitle: {
    color: "#666",
    fontSize: 17,
    fontWeight: "600",
    marginTop: Spacing.sm,
  },
  emptySubtitle: {
    color: "#999",
    fontSize: 13,
    textAlign: "center",
  },

  // Haka Team badge beside name
  hakaOfficialPill: {
    width: 62,
    height: 18,
    marginLeft: 0,
    alignSelf: "center",
  },
});
