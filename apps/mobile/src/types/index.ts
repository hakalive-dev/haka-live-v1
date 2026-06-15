// ── Equipped Cosmetics ────────────────────────────────────────────────────────

/**
 * The subset of a purchased Store item that backend includes on every user
 * summary when that item is equipped and not expired.
 */
export interface EquippedCosmetic {
  id: string;
  name: string;
  image: string | null;
  /** Static PNG/JPG frame — primary visual for chat bubbles in room chat. */
  previewImage?: string | null;
  category: string;
  level: string;
}

/** All wearable cosmetic slots returned on user summaries and /auth/me. */
export interface UserEquippedCosmetics {
  equippedFrame?: EquippedCosmetic | null;
  equippedRing?: EquippedCosmetic | null;
  equippedChatBubble?: EquippedCosmetic | null;
  equippedMicVoiceWave?: EquippedCosmetic | null;
  equippedProfileCard?: EquippedCosmetic | null;
  equippedDynamicProfile?: EquippedCosmetic | null;
}

// ── Auth (Feature 1) ──────────────────────────────────────────────────────────

export interface User extends UserEquippedCosmetics {
  id: string;
  phone: string | null;
  email: string | null;
  username: string | null;
  displayName: string;
  avatar: string;
  bio: string;
  country: string;
  state?: string;
  city?: string;
  gender?: string;
  dateOfBirth?: string | null;
  age?: number | null;
  hakaId: string | null;
  role: "normal_user" | "host" | "agent" | "payroll_agent";
  hostType: "independent" | "agent_host" | "";
  hostApplicationPath: string;
  agentId: string | null;
  onboardingComplete: boolean;
  isVerifiedHost?: boolean;
  isPremiumHost?: boolean;
  createdAt: string;
  updatedAt: string;
  tags?: TagSummary[];
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
  faceVerificationStatus?: string;
  facePhotoUrl?: string;
  faceRejectedReason?: string;
  hasPassword?: boolean;
  /** True when a Google identity is linked via Supabase Auth (auto-linked at login). */
  googleLinked?: boolean;
  /** Super admin may browse state rankings for any country. */
  canInspectStateRankings?: boolean;
  /** Active payroll profile; user may still be role `agent`. */
  isPayrollAgent?: boolean;
}

export interface TagSummary {
  name: string;
  displayName: string;
  color: string;
  iconUrl: string;
  sortOrder?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface OnboardingData {
  username: string;
  displayName: string;
  country: string;
  state?: string;
  city?: string;
  gender?: string;
  dateOfBirth?: string | null;
}

// ── Social Graph (Feature 2) ──────────────────────────────────────────────────

export interface PublicUser extends UserEquippedCosmetics {
  id: string;
  username: string | null;
  displayName: string;
  avatar: string;
  bio: string;
  country: string;
  gender?: string;
  age?: number | null;
  hakaId: string | null;
  role: string;
  hostType: string;
  friendCount?: number;
  followerCount: number;
  followingCount: number;
  momentsCount?: number;
  richLevel?: number;
  charmLevel?: number;
  monthlySent?: number;
  monthlyReceived?: number;
  isFollowing: boolean | null;
  isSpecialAttention: boolean | null;
  createdAt: string;
  tags?: TagSummary[];
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
}

export interface VisitorEntry {
  user: PublicUser;
  visitedAt: string;
}

export interface SpecialAttentionEntry {
  user: PublicUser;
  createdAt: string;
}

/** Node.js backend paginated response format */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** @deprecated legacy shape — kept for unbuilt features; migrate to PaginatedResult when feature is built */
export interface PaginatedList<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

// ── Rooms (Feature 3) ─────────────────────────────────────────────────────────

export interface RoomUser extends UserEquippedCosmetics {
  id: string;
  username: string | null;
  displayName: string;
  avatar: string;
  hakaId?: string | null;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
  profileHidden?: boolean;
  /** From User.country when returned by API (e.g. room list). */
  country?: string;
  /** From User.city when returned by API. */
  city?: string;
  richLevel?: number;
  charmLevel?: number;
  /** Agora RTC UID in this room channel (from API / rtc.uid socket). */
  rtcUid?: number | null;
}

export interface Seat {
  id: string;
  roomId: string;
  position: number;
  userId: string | null;
  user: RoomUser | null;
  isLocked: boolean;
  isMuted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MicConfig = 5 | 10 | 15 | 20 | 25 | 30;
export type RoomCategory =
  | "general"
  | "music"
  | "talk"
  | "gaming"
  | "dating"
  | "education";

export interface ThemePayload {
  id: string;
  name: string;
  gradientFrom: string;
  gradientTo: string;
  backgroundImageUrl: string | null;
  svgaUrl: string | null;
  accentColor: string;
  chatBubbleColor: string;
  /** Links paid themes to a store catalog item (from GET /themes/available). */
  storeItemId?: string | null;
}

export interface Room {
  id: string;
  roomCode?: string | null;
  hostId: string;
  host: RoomUser;
  title: string;
  description: string;
  coverImage: string;
  category: RoomCategory;
  type: "public" | "private";
  roomMode: "chat" | "live";
  status: "idle" | "live" | "ended";
  micConfig: MicConfig;
  isLocked: boolean;
  password?: string | null;
  applyForMic?: boolean;
  chatLocked?: boolean;
  publicMsgEnabled?: boolean;
  bgMusicUrl?: string | null;
  hdMicEnabled?: boolean;
  gameType?: string;
  themeId?: string | null;
  activeTheme?: ThemePayload | null;
  fanBadge?: string;
  viewerCount: number;
  /** Daily regional earner rank badge for the host (from GET /rooms). */
  /** `label` is country display name; shown as `{label} No {rank}` on the badge. */
  hostRegionalEarnerBadge?: { label: string; rank: number; period: "daily" } | null;
  agoraChannel: string;
  /** Host's Agora RTC UID in this channel (null until host has joined RTC). */
  hostRtcUid?: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  seats?: Seat[];
  _count?: { seats: number };
}

export interface RoomMusicTrack {
  id: string;
  name: string;
  url: string;
  position: number;
}

export interface MusicQueue {
  tracks: RoomMusicTrack[];
  currentIndex: number;
  loopQueue: boolean;
}

export interface UserMusicTrack {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  createdAt: string;
}

export interface CurrentMusicTrack {
  url: string;
  name: string;
  trackId: string;
  index: number;
  total: number;
}

export interface CreateRoomData {
  title: string;
  description?: string;
  coverImage?: string;
  category?: RoomCategory;
  type?: "public" | "private";
  micConfig?: MicConfig;
  password?: string;
  roomMode?: "chat" | "live";
}

// ── Agora (Feature 4) ────────────────────────────────────────────────────────

export interface AgoraTokenResult {
  token: string;
  channel: string;
  uid: number;
  appId: string;
  expiresAt: number;
}

// ── Wallet ────────────────────────────────────────────────────────────────────

export interface WalletBalance {
  coinBalance: number;
  beanBalance: number;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  transactionType: "credit" | "debit";
  currency: "coins" | "beans";
  amount: number;
  balanceAfter: number;
  reference:
    | "gift_sent"
    | "gift_received"
    | "gift_commission"
    | "top_up"
    | "withdrawal"
    | "withdrawal_hold"
    | "withdrawal_rejected"
    | "withdrawal_agent_payout"
    | "withdrawal_agent_commission"
    | "exchange"
    | "";
  description: string;
  createdAt: string;
}

export interface ExchangeResult {
  beansSpent: number;
  coinsEarned: number;
  coinBalance: number;
  beanBalance: number;
}

export interface ExchangeRateRule {
  id: string;
  coins: number;
  beansCost: number;
  isPreset: boolean;
  sortOrder: number;
}

// ── Gifts ─────────────────────────────────────────────────────────────────────

export interface Gift {
  id: string;
  name: string;
  icon: string;
  image: string | null;
  svgaAsset: string | null;
  coinCost: number;
  beanValue: number;
  category: "bag" | "hot" | "lucky" | "event" | "svip" | "customized";
  animationType: string;
  soundKey: string;
  order: number;
}

export interface LuckyDrawOutcome {
  drawId: string;
  isWin: boolean;
  /** Multiplier drawn for this send (0 on lose). */
  winMultiplier?: number;
  rewardCoins: number;
  coinCost: number;
  senderCoinBalance?: number;
}

export interface GiftTransaction {
  id: string;
  gift: Gift;
  sender: RoomUser;
  recipient: RoomUser;
  roomId: string | null;
  coinCost: number;
  beanValue: number;
  qty: number;
  createdAt: string;
  luckyDraw?: LuckyDrawOutcome | null;
}

export interface SendGiftPayload {
  giftId: string;
  recipientId?: string; // user destination (mutually exclusive with recipientAgencyId)
  recipientAgencyId?: string; // agency destination (Plan 3 mobile UI)
  roomId?: string;
  qty?: number;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sender: RoomUser;
  content: string | null;
  mediaUrl?: string | null;
  createdAt: string;
  type?: "text" | "quick" | "gift_notice" | "lucky_win_notice" | "system" | "image";
  kind?: "system";
  giftNotice?: {
    giftName: string;
    giftIcon: string;
    recipientName: string;
    qty: number;
    /** Used when giftIcon is empty (legacy catalogue). */
    giftImageFallback?: string | null;
  };
  luckyWin?: {
    giftName: string;
    giftIcon: string;
    rewardCoins: number;
    giftImageFallback?: string | null;
    /** Wins rolled into one chat line after a combo session (default 1). */
    winCount?: number;
    /** Total gifts sent in the combo session that produced the win(s). */
    sendMultiplier?: number;
  };
}

export interface DirectMessage {
  id: string;
  sender: RoomUser;
  recipient: RoomUser;
  content: string;
  isRead: boolean;
  createdAt: string;
  messageType?:
    | "text"
    | "gift"
    | "image"
    | "agent_application"
    | "sub_agent_invite"
    | "coin_transfer"
    | "seller_recharge_approved"
    | "support_reply"
    | "system_notice";
  mediaUrl?: string | null;
  giftId?: string | null;
  giftName?: string;
  giftImage?: string;
  giftIcon?: string;
  giftQty?: number;
  giftCoinCost?: number;
  isDeleted?: boolean;
}

/** Latest admin broadcast for pinned chat row */
export interface TeamAnnouncementPayload {
  id: string;
  title: string;
  body: string;
  preview: string;
  publishedAt: string;
  updatedAt: string;
  isRead: boolean;
}

export interface DMConversation {
  otherUser: RoomUser;
  lastMessage: DirectMessage | null;
  unreadCount: number;
  isOnline?: boolean;
  level?: number;
  levelColor?: string;
  isOfficial?: boolean;
  giftCount?: number;
  isFollowing?: boolean;
  /** True when both users follow each other (mutual follow). */
  isFriend?: boolean;
  isFamiliar?: boolean;
}

// ── Levels ────────────────────────────────────────────────────────────────────

export interface UserLevelInfo {
  richLevel: number;
  richXp: number;
  richNextThreshold: number | null;
  charmLevel: number;
  charmXp: number;
  charmNextThreshold: number | null;
  updatedAt: string;
}

export interface LevelTierInfo {
  label: string;
  coinsRange: string;
  iconLevel: number;
  minLevel: number;
  maxLevel: number;
  isSuper: boolean;
}

export interface LevelTiersResponse {
  tiers: LevelTierInfo[];
  charmTiers: LevelTierInfo[];
  maxLevel: number;
}

export interface LevelLeaderboardEntry {
  id: string;
  richLevel: number;
  richXp: number;
  charmLevel: number;
  charmXp: number;
  user: {
    id: string;
    displayName: string;
    avatar: string;
    hakaId: string | null;
  };
}

// ── Agency ────────────────────────────────────────────────────────────────────

export interface AgencyTierInfo {
  name: string;
  commissionRate: number;
  minHostIncome: string;
}

export interface AgencySummary {
  commission_tier: number;
  commission_rate: number;
  total_xp: number;
  xp_to_next_tier: number | null;
  total_hosts: number;
  total_beans_earned_today: number;
  total_commission_earned_today: number;
  total_beans_earned_week: number;
  total_commission_earned_week: number;
  total_beans_earned_month: number;
  total_commission_earned_month: number;
  total_commission_all_time: number;
  // Plan 2 fields
  tier_name: string;
  effective_commission_rate: number;
  cumulative_host_income: string;
  agency_pot_balance: string;
  current_tier: AgencyTierInfo;
  next_tier: AgencyTierInfo | null;
  all_tiers: AgencyTierInfo[];
}

export interface AgencyHost {
  host: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
  };
  today_host_beans: number;
  today_commission: number;
  week_host_beans: number;
  week_commission: number;
  commission_rate: number;
  monthly_beans: number;
  monthly_commission: number;
}

export interface HostStatEntry {
  date: string;
  host_beans_earned: number;
  agency_commission_earned: number;
  gift_count: number;
}

export interface HostTaskDefinition {
  id: string;
  name: string;
  description: string;
  task_type: string;
  unlock_after_days: number;
  target_value: number;
  reward_beans: number;
}

export interface HostTask {
  id: string;
  task_definition: HostTaskDefinition;
  status: "locked" | "available" | "in_progress" | "completed" | "claimed";
  progress: number;
  unlocked_at: string | null;
  completed_at: string | null;
  claimed_at: string | null;
}

// ── Family ────────────────────────────────────────────────────────────────────

export type FamilyTier = "bronze" | "silver" | "gold";
export type FamilyMemberRole = "owner" | "admin" | "member";

export interface FamilyMember {
  id: string;
  user: RoomUser & { role: string };
  role: FamilyMemberRole;
  joinedAt: string;
  createdAt: string;
}

export interface Family {
  id: string;
  name: string;
  owner: RoomUser;
  tier: FamilyTier;
  badge: string;
  announcement: string;
  weeklyBeans: number;
  totalBeans: number;
  createdAt: string;
  _count: { members: number };
}

export interface FamilyDetail extends Family {
  members: FamilyMember[];
}

export type WithdrawalWorkflowStatus =
  | "pending_review"
  | "assigned"
  | "proof_submitted"
  | "completed"
  | "rejected"
  | "approved"
  | "pending"
  | "disputed";

export type BeanRecordCategory =
  | "gift_received"
  | "creator_commission"
  | "exchange"
  | "withdrawal"
  | "payroll_payout"
  | "payroll_commission";

export interface BeanRecordGiftIncome {
  gift_name: string;
  gift_icon: string;
  gift_image_url: string | null;
  gift_qty: number;
  sender_id: string;
  sender_display_name: string;
  sender_haka_id: string;
  sender_avatar: string | null;
}

export interface BeanRecord {
  id: string;
  transactionType: "credit" | "debit";
  amount: number;
  balanceAfter: number;
  reference: string;
  description: string;
  createdAt: string;
  category: BeanRecordCategory;
  withdrawalStatus: string | null;
  withdrawalId: string | null;
  /** 19-digit withdrawal order ID when matched to a withdrawal request */
  orderId: string | null;
  gift_income: BeanRecordGiftIncome | null;
}

export interface WithdrawalRequestRecord {
  id: string;
  userId: string;
  beansAmount: number;
  status: WithdrawalWorkflowStatus;
  notes: string;
  adminRejectionNotes?: string;
  assignedAgentId?: string | null;
  proofUrl?: string;
  proofUploadedAt?: string | null;
  agentProofNotes?: string;
  verifiedAt?: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TopUpResult {
  coinBalance: number;
  coinsAdded: number;
}

// ── Payments ──────────────────────────────────────────────────────────────────

export interface CurrencyConfig {
  id: string;
  country_code: string;
  country_name: string;
  currency_code: string;
  currency_symbol: string;
  beans_to_currency_rate: string;
  min_withdrawal_beans: number;
}

export interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  bonus_coins: number;
  total_coins: number;
  price_gbp: string;
  order: number;
}

export interface CoinPackageLocal {
  id: string;
  name: string;
  coins: number;
  bonus_coins: number;
  total_coins: number;
  price_local: string;
  currency_symbol: string;
  order: number;
}

export type TopUpPaymentMethod = "upi" | "epay" | "usdt" | "usdc";
export type BindMethodType =
  | "epay"
  | "binance_bep20"
  | "usdt_trc20"
  | "bank_account"
  | "mobile_wallet"
  | "upi";

export interface WithdrawalPayoutMethodOption {
  countryCode: string;
  provider: string;
  label: string;
  category: string;
  methodType: BindMethodType;
  alreadyBound: boolean;
}

export interface PaymentTransaction {
  id: string;
  package_name: string;
  method:
    | "card"
    | "apple_pay"
    | "google_pay"
    | "upi"
    | "epay"
    | "usdt"
    | "usdc"
    | "free"
    | "coin_seller";
  amount_usd: number;
  amount_gbp: string;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  coins_credited: boolean;
  created_at: string;
  type: "purchase" | "free_topup" | "coin_seller_purchase";
}

export interface UserPaymentMethod {
  id: string;
  method_type: BindMethodType;
  country_code?: string;
  provider?: string;
  label?: string;
  is_default: boolean;
  nickname: string;
  masked_account: string;
  account_label?: string;
  isVerified: boolean;
  created_at: string;
}

export interface ManualPaymentRequest {
  id: string;
  method: TopUpPaymentMethod;
  reference_id: string;
  amount_local: string;
  currency_code: string;
  status: "pending" | "confirmed" | "rejected" | "expired";
  package: CoinPackage;
  created_at: string;
  crypto_wallet?: CompanyCryptoWallet;
}

export interface CompanyCryptoWallet {
  crypto_type: string;
  network: string;
  wallet_address: string;
}

export interface WithdrawalRequest {
  id: string;
  beans_amount: number;
  gbp_equivalent: string;
  amount_local: string;
  currency_code: string;
  status: "pending" | "approved" | "rejected" | "paid";
  payment_method: UserPaymentMethod | null;
  payment_details: string;
  created_at: string;
}

export interface CoinSeller {
  id: string;
  displayName: string;
  avatar: string | null;
  hakaId: string;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
  whatsapp_number: string;
  total_coins_sold: number;
  total_customers: number;
  seller_level?: string;
  payment_methods?: string[];
  price_per_coin?: number;
  country_code?: string;
  equippedFrame?: EquippedCosmetic | null;
}

export type CoinSellerTransactionType = "transfer" | "recharge" | "exchange";
export type CoinSellerTargetType = "user" | "coin_seller";

export interface CoinSellerProfile {
  id: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    hakaId: string;
    avatar: string;
    activeSpecialId?: string | null;
    activeSpecialIdLevel?: string | null;
  };
  whatsapp_number: string;
  is_assistant: boolean;
  total_commission_rate: string;
  gift_commission_rate: string;
  income_reward_rate: string;
  gift_bonus_rate: string;
  max_commission_rate?: string;
  max_income_reward_rate?: string;
  max_gift_bonus_rate?: string;
  level_up_rate: string;
  available_balance: number;
  total_balance: number;
  security_deposit: number;
  seller_level: string;
  quick_message: string;
  total_coins_sold: number;
  total_customers: number;
  payment_methods: UserPaymentMethod[];
}

export interface CoinSellerTransaction {
  id: string;
  seller: {
    id: string;
    username: string;
    displayName: string;
    hakaId: string;
    avatar?: string;
    activeSpecialId?: string | null;
    activeSpecialIdLevel?: string | null;
  };
  counterparty: {
    id: string;
    username: string;
    displayName: string;
    hakaId: string;
    avatar?: string;
    activeSpecialId?: string | null;
    activeSpecialIdLevel?: string | null;
  } | null;
  transaction_type: CoinSellerTransactionType;
  target_type: CoinSellerTargetType | "";
  coins_amount: number;
  operator_name: string;
  notes: string;
  created_at: string;
}

export interface CoinSellerCustomer {
  id: string;
  displayName: string;
  avatar: string | null;
  hakaId: string;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
  customer_type: "recommend" | "old";
  trade_count: number;
  last_trade_at: string | null;
  equippedFrame?: EquippedCosmetic | null;
}

export type RechargePaymentMethod =
  | "epay"
  | "usdt_trc20"
  | "usdt_bep20";

export interface SellerRechargePackage {
  id: string;
  amountUsd: number;
  coinsToCredit: number;
}

export interface SellerRechargePaymentInfo {
  usdt_trc20: string;
  usdt_bep20: string;
  epay: string;
}

export interface SellerRechargeRequest {
  id: string;
  amountUsd: number;
  coinsToCredit: number;
  paymentMethod: RechargePaymentMethod;
  proofImageUrl: string | null;
  txHash: string;
  status: "pending" | "approved" | "rejected";
  adminNotes: string;
  createdAt: string;
}

/** Record of beans → seller offline coin exchange (instant for seller; legacy rows may be pending until admin). */
export interface SellerExchangeRequest {
  id: string;
  sellerId: string;
  pointsAmount: number;
  status: "pending" | "approved" | "rejected";
  adminNotes: string;
  processedAt: string | null;
  processedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoinSellerLevelRule {
  id: string;
  level_name: string;
  exchange_limit: string;
  seller_to_user_rate: string;
  user_to_seller_rate: string;
  seller_list_rule: string;
  coin_selling_list_rule: string;
  sort_order: number;
}

export interface AgentSale {
  id: string;
  customer: {
    id: string;
    username: string;
    displayName: string;
    hakaId: string;
  };
  coins_sold: number;
  amount_collected: string;
  currency: string;
  notes: string;
  created_at: string;
}

export interface RazorpayOrderResponse {
  orderId: string;
  amountPaise: number;
  keyId: string;
  coins: number;
  bonusCoins: number;
}

// ── Host Application ──────────────────────────────────────────────────────────

export type HostApplicationPath =
  | "self_apply_independent"
  | "self_apply_with_agent"
  | "agency_invitation";

export type HostApplicationStatus = "pending" | "approved" | "rejected";

export interface HostApplicationUser {
  id: string;
  username: string | null;
  displayName: string;
  avatar: string | null;
  role?: string;
  hostType?: string;
}

export interface HostApplication {
  id: string;
  userId: string;
  agentId: string | null;
  /** The user who applied */
  user: HostApplicationUser;
  /** The agent who invited (for agency_invitation path) */
  agent: HostApplicationUser | null;
  path: HostApplicationPath;
  status: HostApplicationStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export interface LeaderboardUserEntry {
  rank: number;
  score: number;
  id: string;
  username: string | null;
  displayName: string;
  avatar: string | null;
  hakaId?: string | null;
  equippedFrame?: EquippedCosmetic | null;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
  richLevel?: number | null;
  charmLevel?: number | null;
  /** ISO state code when ranking is scoped by state (agent coin sellers). */
  stateCode?: string | null;
}

export interface LeaderboardFamilyEntry {
  rank: number;
  score: number;
  id: string;
  name: string;
  badge_icon: string;
  tier: "bronze" | "silver" | "gold";
  member_count: number;
}

export interface MyRankResult {
  rank: number | null;
  score: number | null;
}

// ── Activity & Analytics ──────────────────────────────────────────────────────

export interface ActivitySummary {
  period: "daily" | "weekly" | "monthly";
  coins_spent: number;
  beans_earned: number;
  gifts_sent_count: number;
  gifts_sent_value: number;
  gifts_received_count: number;
  gifts_received_value: number;
  room_sessions: number;
  total_room_minutes: number;
  followers_gained: number;
  profile_visits: number;
  rich_xp_gained: number;
  charm_xp_gained: number;
}

export interface ActivityChartEntry {
  label: string;
  coins_spent: number;
  beans_earned: number;
  gifts_sent_count: number;
  room_sessions: number;
}

export interface IncomeSummary {
  period: "daily" | "weekly" | "monthly";
  total_beans_earned: number;
  total_gifts_received: number;
  total_room_sessions: number;
  total_room_minutes: number;
  avg_listeners: number;
  commission_earned: number;
  chart: IncomeChartEntry[];
}

export interface IncomeChartEntry {
  label: string;
  beans_earned: number;
  gifts_received: number;
}

export interface TopGifterEntry {
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
  };
  total_coin_value: number;
  gift_count: number;
}

// ── Live Data ─────────────────────────────────────────────────────────────────

export interface LiveDataDaily {
  date: string;
  won_points: number;
  live_earnings: number;
  party_earnings: number;
  live_duration: string;
  live_duration_seconds: number;
  party_duration: string;
  party_duration_seconds: number;
  party_crown_duration: string;
  party_crown_duration_seconds: number;
  new_fans_count: number;
  new_fans_club_count: number;
  gifting_count: number;
  unfollowers_count: number;
}

export interface LiveDataChartEntry {
  label: string;
  points: number;
  duration_minutes: number;
}

export interface LiveDataWeekly {
  week_start: string;
  week_end: string;
  hakaId: string;
  chart: LiveDataChartEntry[];
  total_duration: string;
  total_earnings: number;
  new_fans_count: number;
  new_fans_club_count: number;
  gifting_count: number;
  unfollowers_count: number;
}

export interface LiveDataMonthly {
  month_start: string;
  month_end: string;
  hakaId: string;
  chart: LiveDataChartEntry[];
  total_duration: string;
  total_earnings: number;
  past_3_months_earnings: number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export type StoreCategory =
  | "entry"
  | "frame"
  | "chat_bubble"
  | "theme"
  | "special_id"
  | "profile_card"
  | "mic_voice_wave"
  | "dynamic_profile"
  | "ring";

export interface StoreCategoryItem {
  key: StoreCategory;
  label: string;
}

export type StoreItemLevel = "SSS" | "SS" | "S" | "A" | "B" | "";

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  image: string | null;
  preview_image: string | null;
  category: StoreCategory;
  category_label: string;
  level?: StoreItemLevel;
  coin_cost: number;
  duration_days: number;
  duration_label: string;
  sort_order: number;
  /** When false, item is visible but cannot be purchased. */
  is_for_sale?: boolean;
}

export interface UserStoreItem {
  id: string;
  item: StoreItem;
  is_equipped: boolean;
  expires_at: string | null;
  is_expired: boolean;
  purchased_at: string;
}

// ── Invitations ───────────────────────────────────────────────────────────────

export interface InvitationUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  hakaId: string;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
}

export interface CreatorInvitation {
  id: string;
  /** Alphanumeric invite code (for share links). */
  code: string;
  invitee: InvitationUser | null;
  invitee_hakaId: string;
  status: "pending" | "accepted" | "expired";
  reward_claimed: boolean;
  reward_coins: number;
  created_at: string;
}

export interface InvitationReward {
  id: string;
  reward_type: "invitation_bonus" | "activity_bonus";
  coins: number;
  collected: boolean;
  description: string;
  created_at: string;
}

export interface InvitationRule {
  id: string;
  title: string;
  description: string;
  reward_coins: number;
  sort_order: number;
}

export interface InvitationSummary {
  total_rewards: number;
  received_rewards: number;
  rewards_to_unlock: number;
  wallet_balance: number;
  total_invitations: number;
  accepted_invitations: number;
  /** Agent's current game rebate % from invitee activity (0 = use UI default 0.5%). */
  game_rebate_percent?: number;
  tier1_game_rebate_percent?: number;
  tier2_game_rebate_percent?: number;
}

export interface InvitationRankEntry {
  rank: number;
  score: number;
  /** Weekly shareholder bonus share (coins), from API when available. */
  shareholder_bonus?: number;
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  hakaId: string;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
}

export interface InviteShareholderRewards {
  period: string;
  totalPoints: number;
  shareholderBonusPool: number;
  items: InvitationRankEntry[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
}

// ── Moments ───────────────────────────────────────────────────────────────────

export interface MomentAuthor {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  country: string;
  gender?: string;
  date_of_birth?: string | null;
  age?: number | null;
  rich_level: number;
  charm_level: number;
  equippedFrame?: EquippedCosmetic | null;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
}

export interface MomentPost {
  id: string;
  user: MomentAuthor;
  post_type: "moment" | "video";
  media_url: string | null;
  poster_url?: string | null;
  caption: string;
  hashtag: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  gifts_count: number;
  is_liked: boolean;
  created_at: string;
}

export interface MomentFeed {
  results: MomentPost[];
  count: number;
  page: number;
  page_size: number;
}

export interface MomentComment {
  id: string;
  user: MomentAuthor;
  text: string;
  likes_count: number;
  is_liked: boolean;
  created_at: string;
}

// ── Notifications (Feature 17) ─────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  imageUrl: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UnreadCount {
  count: number;
}

// ── Invites (Feature 15 — Node.js shape) ─────────────────────────────────────

export interface InviteCode {
  id: string;
  inviterId: string;
  inviteeId: string | null;
  code: string;
  status: "pending" | "accepted" | "expired";
  rewardCoins: number;
  rewardClaimed: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  invitee?: {
    id: string;
    username: string | null;
    displayName: string;
    avatar: string | null;
    hakaId: string | null;
  } | null;
}

export interface InviteSummary {
  totalInvites: number;
  acceptedInvites: number;
  totalCoinsEarned: number;
}

// ── Agency (Feature 14 — Node.js shape) ──────────────────────────────────────

export interface AgencyLearnPromotion {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  linkUrl: string;
  viewCount: number;
  likeCount: number;
  tag: string;
}

export interface AgencySummaryV2 {
  commissionTier: { name: string; commissionRate: number };
  totalHosts: number;
  weeklyBeans: number;
  weeklyCommission: number;
  allTimeCommission: number;
  // Day/period breakdowns (Agency Center Data tab)
  todayBeans: number;
  yesterdayBeans: number;
  sameDayLastWeekBeans: number;
  todayCommission: number;
  monthCommission: number;
  directCommissionAllTime: number;
  inviteAgentCommissionAllTime: number;
  // Plan 2 additions
  cumulativeHostIncome: string;
  agencyPotBalance: string;
  effectiveCommissionRate: number;
  effectiveGiftBonusRate: number;
  /** Global + per-agency gates: gift bonus payouts, hide tasks/rankings when true. */
  giftBonusProgramEnabled: boolean;
  giftBonusEnabled: boolean;
  /** Sum of host-side beans (floor(beanValue×0.70)) attributed to this agency in the last 7 days (sliding window). */
  rollingSevenDayAgencyHostIncome: string;
  /** Same attribution as above; last 30 days — drives commission % tier. */
  rollingThirtyDayAgencyHostIncome: string;
  rollingThirtyDayWindowStart: string;
  rollingThirtyDayWindowEnd: string;
  currentGiftBonusTier: {
    name: string;
    bonusRate: number;
    minRollingIncome: string;
  } | null;
  nextGiftBonusTier: {
    name: string;
    bonusRate: number;
    minRollingIncome: string;
  } | null;
  allGiftBonusTiers: Array<{
    name: string;
    bonusRate: number;
    minRollingIncome: string;
  }>;
  currentTier: { name: string; commissionRate: number; minHostIncome: string };
  nextTier: {
    name: string;
    commissionRate: number;
    minHostIncome: string;
  } | null;
  allTiers: Array<{
    name: string;
    commissionRate: number;
    minHostIncome: string;
  }>;
  agencyStatus: 'active' | 'suspended' | 'banned';
  /** Child agencies (sub-agencies) under this agency. */
  subAgencyCount: number;
  /**
   * Hosts with ≥100k coins of gifts received (coin_cost×qty) in the rolling 30-day window.
   * “Base salary” eligibility for Manage tab.
   */
  baseSalaryHostCount: number;
  /** Current calendar month: total beans received by all hosts under this agency (70% of beanValue). */
  monthHostBeans: number;
  /** Current calendar month: total direct commission earned from hosts. */
  monthHostCommission: number;
  /** Current calendar month: total parent_delta commission earned from sub-agents. */
  monthSubAgentCommission: number;
}

export interface AgencyDailyAnalyticsEntry {
  date: string;
  hostBeans: number;
  commission: number;
}

export interface AgencyDailyAnalytics {
  days: number;
  daily: AgencyDailyAnalyticsEntry[];
}

export interface AgencyHostRosterItem {
  id: string;
  username: string | null;
  displayName: string;
  avatar: string | null;
  hostType: string;
  country: string;
  createdAt: string;
  wallet: { beanBalance: number } | null;
}

// ── Activity (Feature 16 — Node.js shape) ────────────────────────────────────

export interface ActivitySummaryV2 {
  period: "daily" | "weekly" | "monthly";
  coinsSpent: number;
  beansEarned: number;
  giftsSentCount: number;
  giftsReceivedCount: number;
  roomSessionsCount: number;
}

export interface IncomeSummaryV2 {
  period: "daily" | "weekly" | "monthly";
  totalBeansEarned: number;
  giftsReceivedCount: number;
  topGifters: Array<{
    user: { id: string; displayName: string; avatar: string | null };
    totalCoins: number;
    count: number;
  }>;
}

export interface ActivityChartDataV2 {
  period: "daily" | "weekly" | "monthly";
  days: number;
  data: Array<{ date: string; coinsSpent: number; beansEarned: number }>;
}

// ── Moderation (Feature 18) ───────────────────────────────────────────────────

export interface ReportRecord {
  id: string;
  reporterId: string;
  targetType: "user" | "room" | "message";
  targetId: string;
  reason: string;
  description: string;
  status: "pending" | "reviewed" | "dismissed";
  reviewedAt: string | null;
  createdAt: string;
  reporter: { id: string; displayName: string; avatar: string | null };
}

export interface BanRecord {
  id: string;
  userId: string;
  adminId: string;
  reason: string;
  banType: "permanent" | "temporary";
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  user: { id: string; displayName: string; avatar: string | null };
}
