import type { NavigatorScreenParams } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CurrentMusicTrack } from "@/types";

// ── Auth Stack ────────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Splash: undefined;
  Intro: undefined;
  Onboarding: { step?: number };
  Login: undefined;
  LoginDirect: undefined;
  Register: undefined;
  Verify: { phone_number: string };
  Terms: undefined;
};

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

// ── Main Tab ──────────────────────────────────────────────────────────────────

export type MainTabParamList = {
  Home: undefined;
  Live: undefined;
  Discover: undefined;
  Chat: undefined;
  Profile: undefined;
};

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  BottomTabScreenProps<MainTabParamList, T>;

// ── Room Stack (modal) ────────────────────────────────────────────────────────

export type RoomStackParamList = {
  Room: {
    roomId: string;
    roomMode?: "live" | "chat";
    isLocked?: boolean;
    hostId?: string;
    autoTakeSeat?: number;
  };
  RoomSettings: { roomId: string };
  RoomMusic: { roomId: string; isHost: boolean };
  UserMusicLibrary: {
    roomId: string;
    onTrackPlayed?: (track: CurrentMusicTrack) => void;
  };
  AddMusic: {
    roomId: string;
    onAdded?: () => void;
    onTrackPlayed?: (track: CurrentMusicTrack) => void;
  };
  PublicProfile: { userId: string };
};

export type RoomStackScreenProps<T extends keyof RoomStackParamList> =
  NativeStackScreenProps<RoomStackParamList, T>;

// ── Root Navigator ────────────────────────────────────────────────────────────

export type StoreScreenParams = {
  initialTab?: "store" | "mine" | "box";
  initialCategory?: string;
  /** When opened from a room, apply themes to this room. */
  roomId?: string;
  /** Highlight the theme currently applied to the target room. */
  activeThemeId?: string | null;
};

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: { step?: number };
  Main: undefined;
  /** Flat params (legacy) or nested `{ screen: 'Room', params }` for seat invites, etc. */
  RoomModal:
    | NavigatorScreenParams<RoomStackParamList>
    | RoomStackParamList["Room"];
  PublicProfile: { userId: string };
  Followers: { userId: string; displayName: string };
  Following: { userId: string; displayName: string };
  Social: {
    userId: string;
    displayName: string;
    initialTab?: "Friends" | "Following" | "Followers" | "Visitors";
  };
  DMConversation: { userId: string; displayName: string };
  Level: { userId?: string };
  AgencyCenter: undefined;
  /** In-app agency commission user guide (see docs/agency-commission-user-guide.md). */
  AgencyCommissionGuide: undefined;
  HostManagement: undefined;
  HostStatDetail: { hostId: string; displayName: string };
  NewLevelTask: undefined;
  FemaleHostTask: undefined;
  BecomeAgent: undefined;
  HostAgent: undefined;
  AgencyInvitations: undefined;
  BecomeHost: undefined;
  HostApplicationStatus: undefined;
  FamilyHub: undefined;
  FamilyDetail: { familyId: string; familyName: string };
  CreateFamily: undefined;
  FamilySearch: undefined;
  Shop: undefined;
  TopUp: undefined;
  Checkout: { packageId: string };
  ManualPaymentConfirm: { requestId: string };
  PaymentHistory: undefined;
  Withdraw: undefined;
  WithdrawalHistory: undefined;
  WithdrawalDetail: { withdrawalId: string };
  AgentTopUp: undefined;
  BindPaymentMethod: { countryCode: string; currency: string; countryName: string };
  BindMobileWallet: { countryCode: string; provider: string; label: string };
  BindUpi: { countryCode: string; provider: string };
  BindBankAccount: {
    countryCode: string;
    provider: string;
    label: string;
  };
  BindEpay: { countryCode: string; provider: string };
  BindBinance: { countryCode: string; provider: string };
  BindUsdtTrc20: { countryCode: string; provider: string };
  PaymentMethodList: undefined;
  Activity: undefined;
  HostCenter: undefined;
  HostData: undefined;
  IncomeAnalysis: { period?: "daily" | "weekly" | "monthly" };
  Settings: undefined;
  DiagnosticsLog: undefined;
  Account: undefined;
  AccountSecurity: undefined;
  DeviceManagement: undefined;
  LanguageSetting: undefined;
  Blocklist: undefined;
  PrivilegeSetting: undefined;
  NewMessageNotification: undefined;
  PrivacySetting: undefined;
  ExchangeCoin: undefined;
  LiveData: undefined;
  Search: { initialQuery?: string } | undefined;
  CoinSeller: { initialSellerSub?: "Myself" | "Trading" } | undefined;
  Payroll: undefined;
  CoinSellerRank: undefined;
  SupporterList: { userId: string; displayName?: string };
  GiftGallery: { userId: string; displayName: string };
  CoinSellerDetails: { filterType?: "transfer" | "recharge" | "exchange" };
  CoinSellerQuickMessage: undefined;
  Authentication: undefined;
  FaceLiveness: undefined;
  Store: StoreScreenParams;
  StoreModal: StoreScreenParams;
  Ranking: { initialTab?: "state" | "agent" | "game" | "creator" };
  StateQueen: { stateCode: string; stateName: string; countryCode?: string };
  CreateRoom: undefined;
  InviteCreator: undefined;
  InviteFriends: undefined;
  InviteRewardDetails: undefined;
  CreateMoment: { postType?: "moment" | "video" };
  Notifications: undefined;
  EditProfile: undefined;
  HelpCenter: undefined;
  VideoCall: {
    userId: string;
    displayName: string;
    callType?: 'voice' | 'video';
    channelId: string;
    agoraToken: string;
    appId: string;
    uid: number;
    /** True when this side answered (callee) — skips ringback / "Ringing…" UI. */
    incoming?: boolean;
  };
  /** Full-screen ringing UI. Token fields are absent on the push path (fetched on answer). */
  IncomingCall: {
    callerId: string;
    callerDisplayName: string;
    callId?: string;
    callType?: 'voice' | 'video';
    channelId?: string;
    agoraToken?: string;
    appId?: string;
    uid?: number;
    /** Auto-accept on mount (user tapped the notification's Answer action). */
    autoAnswer?: boolean;
  };
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
