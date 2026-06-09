export const ROOM_ROLES = {
  HOST: 'host',
  SPEAKER: 'speaker',
  LISTENER: 'listener',
} as const;

export type RoomRole = typeof ROOM_ROLES[keyof typeof ROOM_ROLES];

export const USER_ROLES = {
  NORMAL_USER: 'normal_user',
  HOST: 'host',
  AGENT: 'agent',
  PAYROLL_AGENT: 'payroll_agent',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

export const ADMIN_ROLES = {
  SUPER_ADMIN:  'super_admin',
  ADMIN:        'admin',
  CS:           'cs',
  MODERATOR:    'moderator',
  ASSISTANT:    'assistant',
  OPERATOR:     'operator',
  SENIOR_BD:    'senior_bd',
  BD:           'bd',
  BDM:          'bdm',
} as const;

export type AdminRole = typeof ADMIN_ROLES[keyof typeof ADMIN_ROLES];

// ── Permission keys ───────────────────────────────────────────────────────────
export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW:       'dashboard.view',
  // Users
  USER_VIEW:            'user.view',
  USER_EDIT:            'user.edit',
  USER_BAN:             'user.ban',
  USER_BAN_TEMP:        'user.ban_temp',
  USER_DELETE:          'user.delete',
  USER_ADJUST_BALANCE:  'user.adjust_balance',
  USER_MUTE:            'user.mute',
  USER_VERIFY:          'user.verify',
  USER_VIEW_PASSWORD:   'user.view_password',
  USER_SEND_OTP:        'user.send_otp',
  // Staff / admin management
  ADMIN_VIEW:           'admin.view',
  ADMIN_CREATE:         'admin.create',
  ADMIN_EDIT_ROLE:      'admin.edit_role',
  ADMIN_DEACTIVATE:     'admin.deactivate',
  CUSTOM_ROLES_MANAGE:  'admin.custom_roles',
  // Rooms
  ROOM_VIEW:            'room.view',
  ROOM_CLOSE:           'room.close',
  ROOM_MONITOR:         'room.monitor',
  // Gifts
  GIFT_VIEW:            'gift.view',
  GIFT_MANAGE:          'gift.manage',
  // Payments / finance
  PAYMENT_VIEW:         'payment.view',
  PAYMENT_MANAGE:       'payment.manage',
  WITHDRAWAL_APPROVE:   'payment.withdrawal',
  // Reports / moderation
  REPORT_VIEW:          'report.view',
  REPORT_HANDLE:        'report.handle',
  // System settings
  SETTINGS_VIEW:        'settings.view',
  SETTINGS_EDIT:        'settings.edit',
  // Audit
  AUDIT_VIEW:           'audit.view',
  // Analytics
  ANALYTICS_VIEW:       'analytics.view',
  ANALYTICS_FULL:       'analytics.full',
  // Agencies
  AGENCY_VIEW:          'agency.view',
  AGENCY_MANAGE:        'agency.manage',
  // Events
  EVENT_VIEW:           'event.view',
  EVENT_MANAGE:         'event.manage',
  // Banners
  BANNER_VIEW:          'banner.view',
  BANNER_MANAGE:        'banner.manage',
  // Host applications
  HOST_APP_VIEW:        'host_app.view',
  HOST_APP_MANAGE:      'host_app.manage',
  // Games
  GAME_VIEW:            'game.view',
  GAME_MANAGE:          'game.manage',
  // Risk control
  RISK_VIEW:            'risk.view',
  RISK_MANAGE:          'risk.manage',
  // Special IDs (custom 8-digit haka overrides owned as store items)
  SPECIAL_ID_MANAGE:    'specialId.manage',
  // Staff hierarchy management
  BD_VIEW:              'bd.view',
  BD_MANAGE:            'bd.manage',
  REGION_MANAGE:        'region.manage',
  TARGET_MANAGE:        'target.manage',
  HOST_VIEW:            'host.view',
  HOST_MANAGE:          'host.manage',
  HOST_OWNERSHIP_VIEW:  'host.ownership_view',
  HOST_TRANSFER_AGENCY: 'host.transfer_agency',
  HOST_REMOVE_AGENCY:   'host.remove_agency',
  HOST_ABUSE_VIEW:      'host.abuse_view',
  HOST_REVENUE_VIEW:    'host.revenue_view',
  // Admin/agency lifecycle
  ADMIN_DELETE:         'admin.delete',
  AGENCY_CREATE:        'agency.create',
  // Staff security actions
  STAFF_RESET_PASSWORD: 'staff.reset_password',
  STAFF_OTP:            'staff.otp',
  STAFF_FORCE_LOGOUT:   'staff.force_logout',
  // Financial + emergency controls
  FINANCE_FREEZE:       'finance.freeze',
  EMERGENCY_CONTROL:    'emergency.control',
  // Store items (frames, entries, etc.)
  STORE_MANAGE:         'store.manage',
  /** Super-admin-only distribution (enforced via requireAdminRole on routes). */
  STORE_DISTRIBUTE:     'store.distribute',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// '*' means ALL permissions (super_admin wildcard)
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: [
    'dashboard.view',
    'user.view','user.edit','user.ban','user.ban_temp','user.adjust_balance','user.mute','user.verify',
    'user.view_password','user.send_otp',
    'admin.view','admin.create','admin.edit_role','admin.deactivate',
    'room.view','room.close','room.monitor',
    'gift.view','gift.manage',
    'payment.view',
    'report.view','report.handle',
    'settings.view',
    'audit.view',
    'analytics.view','analytics.full',
    'agency.view','agency.manage',
    'event.view','event.manage',
    'banner.view','banner.manage',
    'host_app.view','host_app.manage',
    'game.view','game.manage',
    'risk.view','risk.manage',
    'specialId.manage',
    'bd.view','bd.manage','region.manage','target.manage','host.view','host.manage',
    'host.ownership_view','host.transfer_agency','host.remove_agency','host.abuse_view','host.revenue_view',
    'store.manage',
    'admin.delete','agency.create',
    'staff.reset_password','staff.otp','staff.force_logout',
    'finance.freeze','emergency.control',
  ],
  cs: [
    'dashboard.view',
    'user.view','user.ban_temp','user.mute',
    'report.view','report.handle',
    'room.monitor',
    'audit.view',
    'analytics.view',
    'host_app.view',
    'risk.view',
    'host.view',
    'host.ownership_view','host.revenue_view',
  ],
  moderator: [
    'dashboard.view',
    'user.view','user.ban_temp','user.mute',
    'room.view','room.close','room.monitor',
    'report.view','report.handle',
    'gift.view',
    'analytics.view',
    'risk.view','risk.manage',
  ],
  assistant: [
    'dashboard.view',
    'user.view',
    'room.view','room.monitor',
    'gift.view',
    'report.view',
    'analytics.view',
    'event.view','event.manage',
    'banner.view','banner.manage',
  ],
  operator: [
    'dashboard.view',
    'analytics.view','analytics.full',
    'agency.view','agency.manage',
    'room.view','room.monitor',
    'event.view','event.manage',
    'banner.view','banner.manage',
    'host_app.view',
    'game.view',
  ],
  senior_bd: [
    'dashboard.view',
    'analytics.view','analytics.full',
    'agency.view','agency.manage',
    'room.view','room.monitor',
    'event.view','event.manage',
    'banner.view','banner.manage',
    'host_app.view',
    'game.view',
    'bd.view','bd.manage','host.view',
    'store.manage',
  ],
  bd: [
    'dashboard.view',
    'analytics.view',
    'agency.view',
    'host_app.view',
    'event.view',
    'banner.view',
    'bd.view','host.view',
    'host.ownership_view','host.revenue_view',
  ],
  bdm: [
    'dashboard.view',
    'analytics.view','analytics.full',
    'agency.view','agency.manage',
    'room.view','room.monitor',
    'event.view','event.manage',
    'banner.view','banner.manage',
    'host_app.view',
    'game.view',
    'bd.view','bd.manage','host.view',
    'host.ownership_view','host.transfer_agency','host.remove_agency','host.abuse_view','host.revenue_view',
    'store.manage',
  ],
};

export const HOST_TYPE = {
  INDEPENDENT: 'independent',
  AGENT_HOST: 'agent_host',
} as const;

export type HostType = typeof HOST_TYPE[keyof typeof HOST_TYPE];

export const HOST_APPLICATION_PATH = {
  AGENCY_INVITATION: 'agency_invitation',
  SELF_APPLY_WITH_AGENT: 'self_apply_with_agent',
  SELF_APPLY_INDEPENDENT: 'self_apply_independent',
} as const;

export type HostApplicationPath = typeof HOST_APPLICATION_PATH[keyof typeof HOST_APPLICATION_PATH];

export const COMMISSION_TIERS = {
  1: { rate: 4,  xpRequired: 0         },
  2: { rate: 8,  xpRequired: 10_000    },
  3: { rate: 12, xpRequired: 50_000    },
  4: { rate: 16, xpRequired: 200_000   },
  5: { rate: 20, xpRequired: 1_000_000 },
} as const;

export const HOST_TASK_STATUS = {
  LOCKED:      'locked',
  AVAILABLE:   'available',
  IN_PROGRESS: 'in_progress',
  COMPLETED:   'completed',
  CLAIMED:     'claimed',
} as const;

export const HOST_TASK_TYPES = {
  STREAM_MINUTES: 'stream_minutes',
  GIFTS_RECEIVED: 'gifts_received',
  NEW_FOLLOWERS:  'new_followers',
  DAYS_ACTIVE:    'days_active',
} as const;

// Roles that count as the "BD" tier of the staff hierarchy.
// senior_bd = Senior BD (manages junior BDs); bd = Junior BD; bdm = legacy alias of senior.
export const BD_TIER_ROLES = [ADMIN_ROLES.BD, ADMIN_ROLES.BDM, ADMIN_ROLES.SENIOR_BD] as string[];
const SENIOR_BD_ROLES = [ADMIN_ROLES.SENIOR_BD, ADMIN_ROLES.BDM] as string[];

export function isBdRole(role: string): boolean {
  return BD_TIER_ROLES.includes(role);
}

export function isSeniorBdRole(role: string): boolean {
  return SENIOR_BD_ROLES.includes(role);
}

export function isJuniorBdRole(role: string): boolean {
  return role === ADMIN_ROLES.BD;
}

// ── Multi-role helpers ──────────────────────────────────────────────────────
// A staff account can hold several roles at once (roles[]); these accept the set.

export function hasBdRole(roles: string[]): boolean {
  return roles.some(isBdRole);
}

export function hasSeniorBdRole(roles: string[]): boolean {
  return roles.some(isSeniorBdRole);
}

export function isSuperAdminRole(roles: string[]): boolean {
  return roles.includes(ADMIN_ROLES.SUPER_ADMIN);
}

/** The primary role to display for an account: first of roles[], else the fallback. */
export function primaryRole(roles: string[] | null | undefined, fallback: string): string {
  return roles && roles.length > 0 ? roles[0] : fallback;
}

/** The effective role set of a staff account, falling back to [role] for legacy rows. */
export function rolesOf(account: { role: string; roles?: string[] | null }): string[] {
  return account.roles?.length ? account.roles : [account.role];
}

/** Merge a single role into a roles[] set (dedup, preserving order). */
export function withRole(roles: string[] | null | undefined, role: string): string[] {
  const set = roles && roles.length > 0 ? [...roles] : [];
  if (!set.includes(role)) set.push(role);
  return set;
}
