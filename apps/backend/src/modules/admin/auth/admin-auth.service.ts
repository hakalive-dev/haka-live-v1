import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../../config/prisma';
import { signAdminToken, refreshTokenExpiresAt } from '../../../utils/jwt';
import { AppError } from '../../../middleware/error.middleware';
import { resolveAdminPermissions } from '../../../middleware/admin-auth.middleware';
import { isBdRole, withRole } from '../../../shared-types/roles';
import { generateUniqueHakaId } from '../../../utils/hakaId';
import { encryptPasswordSnapshot, buildLoginPasswordDisplay } from '../../accounts/password-snapshot';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AdminTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SafeAdmin {
  id: string;
  email: string;
  displayName: string;
  role: string;
  roles: string[];
  permissions: string[];
  avatarUrl: string;
  isActive: boolean;
  region: string | null;
  hakaId: string | null;
  managerId: string | null;
  username: string | null;
  phone: string | null;
  country: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  loginPasswordDisplay?: string;
  loginPasswordCopyable?: boolean;
  loginPasswordPlaintext?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function toSafeAdmin(admin: {
  id: string;
  email: string;
  displayName: string;
  role: string;
  roles?: string[];
  customPermissions: string[];
  avatarUrl: string;
  isActive: boolean;
  region: string | null;
  hakaId: string | null;
  managerId: string | null;
  username: string | null;
  phone: string | null;
  country: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string;
  passwordSnapshot?: string;
}, permissions: string[] = [], opts: { includePassword?: boolean } = {}): SafeAdmin {
  const base: SafeAdmin = {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    roles: admin.roles?.length ? admin.roles : [admin.role],
    permissions,
    avatarUrl: admin.avatarUrl,
    isActive: admin.isActive,
    region: admin.region,
    hakaId: admin.hakaId,
    managerId: admin.managerId,
    username: admin.username,
    phone: admin.phone,
    country: admin.country,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };

  if (opts.includePassword) {
    const pw = buildLoginPasswordDisplay(admin.passwordSnapshot ?? '', Boolean(admin.passwordHash));
    base.loginPasswordDisplay = pw.display;
    base.loginPasswordCopyable = pw.copyable;
    base.loginPasswordPlaintext = pw.plaintext;
  }

  return base;
}

function snapshotOrEmpty(plaintext: string): string {
  try {
    return encryptPasswordSnapshot(plaintext);
  } catch {
    return '';
  }
}

async function issueAdminTokens(adminId: string, role: string, roles?: string[]): Promise<AdminTokenPair> {
  const accessToken = signAdminToken({ sub: adminId, role, roles: roles?.length ? roles : [role] });
  const refreshToken = uuidv4();

  await prisma.adminRefreshToken.create({
    data: {
      token: refreshToken,
      adminId,
      expiresAt: refreshTokenExpiresAt(),
    },
  });

  return { accessToken, refreshToken };
}

// ── Service methods ────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<{ admin: SafeAdmin; tokens: AdminTokenPair }> {
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) throw new AppError('Invalid email or password', 401);
  if (!admin.isActive) throw new AppError('Account disabled', 403);

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) throw new AppError('Invalid email or password', 401);

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = await issueAdminTokens(admin.id, admin.role, admin.roles);
  const permissions = await resolveAdminPermissions(admin.role, admin.id);
  return { admin: toSafeAdmin(admin, permissions), tokens };
}

export async function loginWithOtp(email: string, otpCode: string): Promise<{ admin: SafeAdmin; tokens: AdminTokenPair }> {
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) throw new AppError('Invalid email or OTP', 401);
  if (!admin.isActive) throw new AppError('Account disabled', 403);

  const latest = await prisma.adminEmergencyOtp.findFirst({
    where: {
      adminId: admin.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest) throw new AppError('Invalid or expired OTP', 401);

  const valid = await bcrypt.compare(otpCode, latest.codeHash);
  if (!valid) throw new AppError('Invalid or expired OTP', 401);

  await prisma.$transaction(async (tx) => {
    await tx.adminEmergencyOtp.update({
      where: { id: latest.id },
      data: { usedAt: new Date() },
    });
    await tx.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
  });

  const tokens = await issueAdminTokens(admin.id, admin.role, admin.roles);
  const permissions = await resolveAdminPermissions(admin.role, admin.id);
  return { admin: toSafeAdmin(admin, permissions), tokens };
}

export async function refreshTokens(token: string): Promise<AdminTokenPair> {
  const stored = await prisma.adminRefreshToken.findUnique({ where: { token } });
  if (!stored) throw new AppError('Invalid refresh token', 401);

  if (stored.expiresAt < new Date()) {
    await prisma.adminRefreshToken.deleteMany({ where: { token } });
    throw new AppError('Refresh token expired', 401);
  }

  const admin = await prisma.adminUser.findUnique({ where: { id: stored.adminId } });
  if (!admin || !admin.isActive) throw new AppError('Admin not found', 401);

  await prisma.adminRefreshToken.deleteMany({ where: { token } });
  return issueAdminTokens(admin.id, admin.role, admin.roles);
}

export async function getMe(adminId: string): Promise<SafeAdmin> {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!admin) throw new AppError('Admin not found', 404);
  const permissions = await resolveAdminPermissions(admin.role, admin.id);
  return toSafeAdmin(admin, permissions);
}

export async function changePassword(adminId: string, oldPassword: string, newPassword: string): Promise<void> {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!admin) throw new AppError('Admin not found', 404);

  const valid = await bcrypt.compare(oldPassword, admin.passwordHash);
  if (!valid) throw new AppError('Current password is incorrect', 400);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.adminUser.update({
    where: { id: adminId },
    data: { passwordHash, passwordSnapshot: snapshotOrEmpty(newPassword) },
  });

  // Revoke all refresh tokens on password change.
  await prisma.adminRefreshToken.deleteMany({ where: { adminId } });
}

// A staff account's Haka ID intentionally mirrors a real User.hakaId (the staff
// member's own app identity), and a single Haka ID may now back several staff
// roles. So a provided Haka ID is accepted as-is; only auto-generate when absent.
// Whether a provided Haka ID maps to an EXISTING staff account (→ add a role) vs a
// new one is decided by the caller (see createAdmin).
async function resolveStaffHakaId(provided?: string | null): Promise<string> {
  const trimmed = provided?.trim();
  if (trimmed) return trimmed;
  return generateUniqueHakaId();
}

export async function createAdmin(
  email: string,
  password: string,
  displayName: string,
  role: string = 'admin',
  customPermissions: string[] = [],
  extra: {
    region?: string | null;
    hakaId?: string | null;
    managerId?: string | null;
    username?: string | null;
    phone?: string | null;
    country?: string;
  } = {},
  opts: { allowBdRole?: boolean } = {},
): Promise<{ admin: SafeAdmin; merged: boolean }> {
  if (!opts.allowBdRole && isBdRole(role)) {
    throw new AppError('Create BD accounts via POST /api/v1/admin/bd', 400);
  }

  // One account, many roles: if the supplied Haka ID already backs a staff account,
  // ADD this role to it (keeping its existing email/password) instead of creating a
  // duplicate. The Haka ID is the person's identity.
  const trimmedHaka = extra.hakaId?.trim();
  if (trimmedHaka) {
    const existingStaff = await prisma.adminUser.findFirst({ where: { hakaId: trimmedHaka } });
    if (existingStaff) {
      const updated = await prisma.adminUser.update({
        where: { id: existingStaff.id },
        data: {
          roles: withRole(existingStaff.roles, role),
          // Enrich role-specific fields only when explicitly provided (never clobber).
          ...(extra.region !== undefined ? { region: extra.region } : {}),
          ...(extra.managerId !== undefined ? { managerId: extra.managerId } : {}),
          ...(extra.username ? { username: extra.username } : {}),
          ...(extra.phone ? { phone: extra.phone } : {}),
          ...(extra.country ? { country: extra.country } : {}),
        },
      });
      return { admin: toSafeAdmin(updated, [], { includePassword: true }), merged: true };
    }
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) throw new AppError('Email already registered', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const hakaId = await resolveStaffHakaId(extra.hakaId);

  const admin = await prisma.adminUser.create({
    data: {
      email, passwordHash, passwordSnapshot: snapshotOrEmpty(password), displayName, role, roles: [role], customPermissions,
      region: extra.region ?? null,
      hakaId,
      managerId: extra.managerId ?? null,
      username: extra.username ?? null,
      phone: extra.phone ?? null,
      country: extra.country ?? '',
    },
  });

  return { admin: toSafeAdmin(admin, [], { includePassword: true }), merged: false };
}

export async function listAdmins(): Promise<SafeAdmin[]> {
  const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: 'desc' } });
  return admins.map(admin => toSafeAdmin(admin, [], { includePassword: true }));
}

export async function updateAdmin(
  adminId: string,
  data: {
    role?: string;
    customPermissions?: string[];
    region?: string | null;
    hakaId?: string | null;
    managerId?: string | null;
    username?: string | null;
    phone?: string | null;
    country?: string;
    password?: string;
  },
): Promise<SafeAdmin> {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!admin) throw new AppError('Admin not found', 404);

  const { password, ...rest } = data;
  const updateData: typeof rest & { roles?: string[]; passwordHash?: string; passwordSnapshot?: string } = { ...rest };

  if (password !== undefined) {
    const trimmed = password.trim();
    if (trimmed.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }
    updateData.passwordHash = await bcrypt.hash(trimmed, 12);
    updateData.passwordSnapshot = snapshotOrEmpty(trimmed);
    await prisma.adminRefreshToken.deleteMany({ where: { adminId } });
  }
  if (updateData.hakaId !== undefined) {
    // A Haka ID may be shared across a User and one or more staff accounts (one
    // identity, many roles), so no uniqueness rejection here — just normalise.
    updateData.hakaId = updateData.hakaId?.trim() ?? null;
  }
  // Changing the primary role keeps roles[] consistent (role must be a member).
  if (updateData.role !== undefined) {
    updateData.roles = withRole(admin.roles, updateData.role);
  }

  const updated = await prisma.adminUser.update({ where: { id: adminId }, data: updateData });
  return toSafeAdmin(updated, [], { includePassword: true });
}

export async function deactivateAdmin(adminId: string): Promise<void> {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!admin) throw new AppError('Admin not found', 404);
  await prisma.adminUser.update({ where: { id: adminId }, data: { isActive: false } });
}

export async function reactivateAdmin(adminId: string): Promise<void> {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!admin) throw new AppError('Admin not found', 404);
  await prisma.adminUser.update({ where: { id: adminId }, data: { isActive: true } });
}

export async function setPermissionsRevoked(targetAdminId: string, revoked: boolean): Promise<void> {
  const admin = await prisma.adminUser.findUnique({ where: { id: targetAdminId } });
  if (!admin) throw new AppError('Admin not found', 404);

  await prisma.adminUser.update({
    where: { id: targetAdminId },
    data: { permissionsRevoked: revoked },
  });

  // Force logout across all sessions for immediate effect.
  await prisma.adminRefreshToken.deleteMany({ where: { adminId: targetAdminId } });
}

function generateTempPassword(): string {
  // 16 chars, URL-safe-ish: base64url without padding.
  return crypto.randomBytes(12).toString('base64url');
}

export async function resetPassword(
  targetAdminId: string,
  newPassword?: string,
): Promise<{ tempPassword: string }> {
  const admin = await prisma.adminUser.findUnique({ where: { id: targetAdminId } });
  if (!admin) throw new AppError('Admin not found', 404);

  const tempPassword = newPassword?.trim() || generateTempPassword();
  if (tempPassword.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await prisma.adminUser.update({
    where: { id: targetAdminId },
    data: {
      passwordHash,
      passwordSnapshot: snapshotOrEmpty(tempPassword),
      mustChangePassword: true,
    },
  });
  await prisma.adminRefreshToken.deleteMany({ where: { adminId: targetAdminId } });
  return { tempPassword };
}

function generateOtpCode(): string {
  // 8 digits (human-friendly).
  const n = crypto.randomInt(0, 1_0000_0000);
  return String(n).padStart(8, '0');
}

export async function generateEmergencyOtp(targetAdminId: string): Promise<{ otpCode: string; expiresAt: string }> {
  const admin = await prisma.adminUser.findUnique({ where: { id: targetAdminId } });
  if (!admin) throw new AppError('Admin not found', 404);

  const otpCode = generateOtpCode();
  const codeHash = await bcrypt.hash(otpCode, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Keep only one active OTP at a time.
  await prisma.adminEmergencyOtp.updateMany({
    where: { adminId: targetAdminId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });

  await prisma.adminEmergencyOtp.create({
    data: {
      adminId: targetAdminId,
      codeHash,
      expiresAt,
    },
  });

  return { otpCode, expiresAt: expiresAt.toISOString() };
}

export async function canDeleteAdmin(targetAdminId: string): Promise<{ canDelete: boolean; reasons: string[] }> {
  const admin = await prisma.adminUser.findUnique({ where: { id: targetAdminId }, select: { id: true } });
  if (!admin) throw new AppError('Admin not found', 404);

  const [
    refreshTokens,
    emergencyOtps,
    managedAgencyAssignments,
    withdrawalFreeze,
    reportsCount,
    staffTargets,
    announcements,
  ] = await Promise.all([
    prisma.adminRefreshToken.count({ where: { adminId: targetAdminId } }),
    prisma.adminEmergencyOtp.count({ where: { adminId: targetAdminId } }),
    prisma.adminAgencyAssignment.count({ where: { adminId: targetAdminId } }),
    prisma.adminWithdrawalFreeze.count({ where: { adminId: targetAdminId } }),
    prisma.adminUser.count({ where: { managerId: targetAdminId } }),
    prisma.staffTarget.count({ where: { staffId: targetAdminId } }),
    prisma.teamAnnouncement.count({ where: { createdByAdminId: targetAdminId } }),
  ]);

  const reasons: string[] = [];
  if (refreshTokens > 0) reasons.push('Has active refresh tokens')
  if (managedAgencyAssignments > 0) reasons.push('Has assigned agencies')
  if (reportsCount > 0) reasons.push('Has staff reports (hierarchy)')
  if (staffTargets > 0) reasons.push('Has staff targets')
  if (announcements > 0) reasons.push('Has created team announcements')
  if (withdrawalFreeze > 0) reasons.push('Owns a withdrawal freeze configuration')
  if (emergencyOtps > 0) reasons.push('Has emergency OTP history')

  return { canDelete: reasons.length === 0, reasons };
}

export async function hardDeleteAdmin(actorAdminId: string, targetAdminId: string): Promise<{ deleted: boolean }> {
  if (actorAdminId === targetAdminId) throw new AppError('You cannot delete your own account', 400);

  const check = await canDeleteAdmin(targetAdminId);
  if (!check.canDelete) {
    throw new AppError(`Cannot delete admin: ${check.reasons.join(', ')}`, 400);
  }

  await prisma.adminUser.delete({ where: { id: targetAdminId } });
  return { deleted: true };
}

export async function updateAvatarUrl(adminId: string, avatarUrl: string): Promise<SafeAdmin> {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });
  if (!admin) throw new AppError('Admin not found', 404);
  const updated = await prisma.adminUser.update({ where: { id: adminId }, data: { avatarUrl } });
  const permissions = await resolveAdminPermissions(updated.role, updated.id);
  return toSafeAdmin(updated, permissions);
}

export async function logout(token: string): Promise<void> {
  await prisma.adminRefreshToken.deleteMany({ where: { token } });
}
