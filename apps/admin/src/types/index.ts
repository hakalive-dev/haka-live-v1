// ── API envelope ──────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean
  data: T
  message: string
  /** Present on 400 "Validation failed" — per-field Zod errors. */
  errors?: Record<string, string[]>
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: Pagination
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export interface Admin {
  id: string
  email: string
  displayName: string
  role: string
  roles: string[]
  permissions: string[]
  avatarUrl: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomRole {
  id: string
  name: string
  displayName: string
  color: string
  permissions: string[]
  isBuiltIn?: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface AllRoles {
  builtIn: { name: string; displayName: string; color: string; isBuiltIn: true; permissions: string[] }[]
  custom: CustomRole[]
}

// ── Event ─────────────────────────────────────────────────────────────────────
export interface EventReward {
  id: string
  rank: number
  rewardType: 'coins' | 'cash' | 'badge' | 'item'
  rewardLabel: string
  rewardAmount: number
}

export interface Event {
  id: string
  name: string
  type: 'competition' | 'festival' | 'lucky_draw' | 'game_event'
  status: 'draft' | 'upcoming' | 'active' | 'expired'
  startDate: string
  endDate: string
  bannerUrl: string
  description: string
  entryRequirement: 'free' | 'coins'
  entryCost: number
  participationType: 'solo' | 'team'
  scoringSystem: 'gifts_received' | 'coins_spent' | 'game_wins'
  rankingPeriod: 'daily' | 'weekly' | 'global'
  visibility: { homePage: boolean; bannerSlider: boolean; pushNotification: boolean }
  rewards: EventReward[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ── Banner ────────────────────────────────────────────────────────────────────
export interface Banner {
  id: string
  imageUrl: string
  title: string
  subtitle: string
  redirectType: 'event' | 'external' | 'user_profile' | 'game'
  redirectValue: string
  priority: number
  isActive: boolean
  startDate: string
  endDate: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

// ── User ──────────────────────────────────────────────────────────────────────
export interface User {
  id: string
  displayName: string
  username: string | null
  phone: string | null
  email: string | null
  hakaId: string | null
  avatar: string
  role: string
  hostType: string
  hostApplicationPath: string
  agentId: string | null
  isActive: boolean
  onboardingComplete: boolean
  country: string
  createdAt: string
  updatedAt: string
}

// ── Room ──────────────────────────────────────────────────────────────────────
export interface Room {
  id: string
  title: string
  description: string
  coverImage: string
  category: string
  type: string
  status: string
  micConfig: number
  isLocked: boolean
  viewerCount: number
  host: { id: string; displayName: string; avatar: string; hakaId: string | null }
  startedAt: string | null
  endedAt: string | null
  createdAt: string
}

// ── Gift ──────────────────────────────────────────────────────────────────────
export interface Gift {
  id: string
  name: string
  icon: string
  image: string | null
  svgaAsset: string | null
  coinCost: number
  beanValue: number
  category: string
  animationType: string
  soundKey: string
  isActive: boolean
  order: number
}

export interface GiftTransaction {
  id: string
  sender: { id: string; displayName: string; hakaId: string | null }
  recipient: { id: string; displayName: string; hakaId: string | null }
  gift: { name: string; icon: string; coinCost: number }
  coinCost: number
  beanValue: number
  roomId: string | null
  createdAt: string
}

// ── Wallet ────────────────────────────────────────────────────────────────────
export interface Wallet {
  id: string
  userId: string
  coinBalance: number
  beanBalance: number
  user: { id: string; displayName: string; hakaId: string | null; avatar: string }
}

export interface WalletTransaction {
  id: string
  walletId: string
  transactionType: string
  currency: string
  amount: number
  balanceAfter: number
  reference: string
  description: string
  createdAt: string
}

// ── Audit ─────────────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string
  adminId: string
  action: string
  targetType: string
  targetId: string
  metadata: Record<string, unknown> | null
  ipAddress: string
  createdAt: string
  admin: { id: string; displayName: string; email: string } | null
}

// ── System Setting ────────────────────────────────────────────────────────────
export interface SystemSetting {
  id: string
  key: string
  value: unknown
  updatedBy: string
  updatedAt: string
  createdAt: string
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface DashboardStats {
  totalUsers: number
  activeUsers: number
  verifiedUsers: number
  totalRooms: number
  liveRooms: number
  totalGiftTransactions: number
  totalWalletTransactions: number
  newUsersToday: number
  newUsersThisWeek: number
  newUsersThisMonth: number
  totalBeansDistributed: number
  pendingWithdrawals: number
  pendingReports: number
  totalAgencies: number
  activeHosts: number
}
