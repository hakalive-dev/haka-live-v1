import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as adminAuthService from './admin-auth.service';
import { ok, created } from '../../../utils/response';
import { storageFilename } from '../../../utils/upload';
import { uploadToStorage } from '../../../utils/storage';
import { logAdminAction } from '../../../utils/audit';

// ── Schemas ────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const loginOtpSchema = z.object({
  email: z.string().email(),
  otpCode: z.string().min(4),
});

const refreshSchema = z.object({
  refreshToken: z.string().uuid(),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// Role can be any built-in or custom role name; service validates further
const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  role: z.string().min(1).default('moderator'),
  customPermissions: z.array(z.string()).optional().default([]),
  region: z.string().nullable().optional(),
  hakaId: z.string().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  username: z.string().min(1).max(50).nullable().optional(),
  phone: z.string().min(3).max(30).nullable().optional(),
  country: z.string().max(64).optional(),
});

const updateAdminSchema = z.object({
  role: z.string().min(1).optional(),
  customPermissions: z.array(z.string()).optional(),
  region: z.string().nullable().optional(),
  hakaId: z.string().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  username: z.string().min(1).max(50).nullable().optional(),
  phone: z.string().min(3).max(30).nullable().optional(),
  country: z.string().max(64).optional(),
  password: z.string().min(8).optional(),
});

const logoutSchema = z.object({
  refreshToken: z.string().uuid(),
});

// ── Handlers ───────────────────────────────────────────────────────────────────

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await adminAuthService.login(email, password);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function loginWithOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, otpCode } = loginOtpSchema.parse(req.body);
    const result = await adminAuthService.loginWithOtp(email, otpCode);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await adminAuthService.refreshTokens(refreshToken);
    ok(res, tokens);
  } catch (err) { next(err); }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = await adminAuthService.getMe(req.admin!.id);
    ok(res, admin);
  } catch (err) { next(err); }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { oldPassword, newPassword } = changePasswordSchema.parse(req.body);
    await adminAuthService.changePassword(req.admin!.id, oldPassword, newPassword);
    ok(res, null, 'Password changed successfully');
  } catch (err) { next(err); }
}

export async function createAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createAdminSchema.parse(req.body);
    const { admin, merged } = await adminAuthService.createAdmin(
      data.email, data.password, data.displayName, data.role, data.customPermissions,
      {
        region: data.region,
        hakaId: data.hakaId,
        managerId: data.managerId,
        username: data.username,
        phone: data.phone,
        country: data.country,
      },
    );
    created(res, { ...admin, merged }, merged ? 'Role added to existing staff account' : 'Admin created');
  } catch (err) { next(err); }
}

export async function listAdmins(req: Request, res: Response, next: NextFunction) {
  try {
    const admins = await adminAuthService.listAdmins();
    ok(res, admins);
  } catch (err) { next(err); }
}

export async function updateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateAdminSchema.parse(req.body);
    const admin = await adminAuthService.updateAdmin(req.params.id, data);
    ok(res, admin, 'Admin updated');
  } catch (err) { next(err); }
}

export async function deactivateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    await adminAuthService.deactivateAdmin(req.params.id);
    ok(res, null, 'Admin deactivated');
  } catch (err) { next(err); }
}

export async function reactivateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    await adminAuthService.reactivateAdmin(req.params.id);
    ok(res, null, 'Admin reactivated');
  } catch (err) { next(err); }
}

export async function removePermissions(req: Request, res: Response, next: NextFunction) {
  try {
    await adminAuthService.setPermissionsRevoked(req.params.id, true);
    await logAdminAction(req.admin!.id, 'admin.permissions_revoked', 'AdminUser', req.params.id, undefined, req.ip);
    ok(res, null, 'Permissions revoked');
  } catch (err) { next(err); }
}

export async function restorePermissions(req: Request, res: Response, next: NextFunction) {
  try {
    await adminAuthService.setPermissionsRevoked(req.params.id, false);
    await logAdminAction(req.admin!.id, 'admin.permissions_restored', 'AdminUser', req.params.id, undefined, req.ip);
    ok(res, null, 'Permissions restored');
  } catch (err) { next(err); }
}

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).optional(),
});

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { newPassword } = resetPasswordSchema.parse(req.body ?? {});
    const result = await adminAuthService.resetPassword(req.params.id, newPassword);
    await logAdminAction(req.admin!.id, 'admin.reset_password', 'AdminUser', req.params.id, undefined, req.ip);
    ok(res, result, newPassword ? 'Password updated' : 'Temporary password generated');
  } catch (err) { next(err); }
}

export async function generateOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminAuthService.generateEmergencyOtp(req.params.id);
    await logAdminAction(req.admin!.id, 'admin.generate_otp', 'AdminUser', req.params.id, { expiresAt: result.expiresAt }, req.ip);
    ok(res, result, 'OTP generated');
  } catch (err) { next(err); }
}

export async function canDeleteAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await adminAuthService.canDeleteAdmin(req.params.id));
  } catch (err) { next(err); }
}

export async function hardDeleteAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminAuthService.hardDeleteAdmin(req.admin!.id, req.params.id);
    await logAdminAction(req.admin!.id, 'admin.delete', 'AdminUser', req.params.id, result, req.ip);
    ok(res, result, 'Admin deleted');
  } catch (err) { next(err); }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = logoutSchema.parse(req.body);
    await adminAuthService.logout(refreshToken);
    ok(res, null, 'Logged out');
  } catch (err) { next(err); }
}

/** Upload a file (evidence, document) to Supabase Storage and return its public URL */
export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, data: null, message: 'No file uploaded' });
      return;
    }
    const filename = `evidence/${storageFilename(req.file.originalname)}`;
    const url = await uploadToStorage(req.file.buffer, filename, req.file.mimetype);
    ok(res, { url, filename, size: req.file.size });
  } catch (err) { next(err); }
}

/** Upload and set the calling admin's avatar via Supabase Storage */
export async function updateMyAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, data: null, message: 'No file uploaded' });
      return;
    }
    const filename = `avatars/admin-${req.admin!.id}-${storageFilename(req.file.originalname)}`;
    const avatarUrl = await uploadToStorage(req.file.buffer, filename, req.file.mimetype);
    const admin = await adminAuthService.updateAvatarUrl(req.admin!.id, avatarUrl);
    ok(res, admin, 'Avatar updated');
  } catch (err) { next(err); }
}
