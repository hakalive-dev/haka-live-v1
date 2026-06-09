import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as usersService from './admin-users.service';
import { ok } from '../../../utils/response';
import { storageFilename } from '../../../utils/upload';
import { uploadToStorage } from '../../../utils/storage';
import { resolveAdminPermissions } from '../../../middleware/admin-auth.middleware';

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  role: z.string().optional(),
  hostType: z.string().optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  country: z.string().optional(),
  isMuted: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'displayName', 'coinBalance', 'richLevel']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const roleSchema = z.object({
  role: z.enum(['normal_user', 'host', 'agent', 'payroll_agent']),
});

const editSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  username: z.string().min(2).max(30).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  country: z.string().optional(),
  city: z.string().max(100).optional(),
  gender: z.enum(['male', 'female', '']).optional(),
  bio: z.string().max(200).optional(),
});

const adjustCoinsSchema = z.object({
  amount: z.number().int().refine(v => v !== 0, 'Amount cannot be zero'),
  currency: z.enum(['coins', 'beans']),
  reason: z.string().min(1),
});

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await usersService.listUsers(params);
    ok(res, result);
  } catch (err) { next(err); }
}


export async function getUserDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const perms = req.admin!.permissions
      ?? await resolveAdminPermissions(req.admin!.role, req.admin!.id);
    const canViewPassword = perms.includes('*') || perms.includes('user.view_password');
    const user = await usersService.getUserDetail(req.params.id, { canViewPassword });
    ok(res, user);
  } catch (err) { next(err); }
}

const banUserSchema = z.object({
  reason: z.string().max(500).optional(),
  banType: z.enum(['permanent', 'temporary']).default('permanent'),
  expiresAt: z.string().datetime().optional(),
  proofUrl: z.string().url().optional().or(z.literal('')),
  result: z.string().max(500).optional(),
});

export async function banUser(req: Request, res: Response, next: NextFunction) {
  try {
    // Body is optional — older clients call this with no body for a permanent ban.
    const parsed = banUserSchema.safeParse(req.body ?? {});
    const input = parsed.success
      ? {
          reason: parsed.data.reason,
          banType: parsed.data.banType,
          expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
          proofUrl: parsed.data.proofUrl,
          result: parsed.data.result,
        }
      : {};
    const result = await usersService.banUser(req.admin!.id, req.params.id, input, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function unbanUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.unbanUser(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function changeRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { role } = roleSchema.parse(req.body);
    const result = await usersService.changeUserRole(req.admin!.id, req.params.id, role, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function deactivateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.deactivateUser(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function activateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.activateUser(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.deleteUser(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function editUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = editSchema.parse(req.body);
    const result = await usersService.editUser(req.admin!.id, req.params.id, data, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function updateProfileName(req: Request, res: Response, next: NextFunction) {
  try {
    const { displayName } = z.object({ displayName: z.string().min(1).max(50) }).parse(req.body);
    const result = await usersService.adminUpdateDisplayName(
      req.admin!.id, req.params.id, displayName, req.ip,
    );
    ok(res, result, 'Name updated');
  } catch (err) { next(err); }
}

export async function updateProfileCountry(req: Request, res: Response, next: NextFunction) {
  try {
    const { country } = z.object({ country: z.string().min(1).max(100) }).parse(req.body);
    const result = await usersService.adminUpdateCountry(
      req.admin!.id, req.params.id, country, req.ip,
    );
    ok(res, result, 'Country updated');
  } catch (err) { next(err); }
}

export async function updateProfileGender(req: Request, res: Response, next: NextFunction) {
  try {
    const { gender } = z.object({ gender: z.enum(['male', 'female', '']) }).parse(req.body);
    const result = await usersService.adminUpdateGender(
      req.admin!.id, req.params.id, gender, req.ip,
    );
    ok(res, result, 'Gender updated');
  } catch (err) { next(err); }
}

export async function updateProfilePhone(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone } = z.object({ phone: z.string().min(5).max(30) }).parse(req.body);
    const result = await usersService.adminUpdatePhone(
      req.admin!.id, req.params.id, phone, req.ip,
    );
    ok(res, result, 'Phone updated');
  } catch (err) { next(err); }
}

export async function adjustCoins(req: Request, res: Response, next: NextFunction) {
  try {
    const { amount, currency, reason } = adjustCoinsSchema.parse(req.body);
    const result = await usersService.adjustCoins(req.admin!.id, req.params.id, amount, currency, reason, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function muteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.muteUser(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function unmuteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.unmuteUser(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

const hostBanSchema = z.object({
  reason: z.string().max(500).optional(),
  banType: z.enum(['permanent', 'temporary']).default('permanent'),
  expiresAt: z.string().datetime().optional(),
});

export async function hostBanUser(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = hostBanSchema.safeParse(req.body ?? {});
    const input = parsed.success
      ? {
          reason: parsed.data.reason,
          banType: parsed.data.banType,
          expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        }
      : {};
    const result = await usersService.hostBanUser(req.admin!.id, req.params.id, input, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function hostUnbanUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.hostUnbanUser(req.admin!.id, req.params.id, req.ip);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function getSameDeviceUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.getSameDeviceUsers(req.params.id);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function updateUserAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, data: null, message: 'No file uploaded' });
      return;
    }
    const filename = `avatars/user-${req.params.id}-${storageFilename(req.file.originalname)}`;
    const avatarUrl = await uploadToStorage(req.file.buffer, filename, req.file.mimetype);
    const user = await usersService.updateUserAvatar(req.admin!.id, req.params.id, avatarUrl, req.ip);
    ok(res, { avatarUrl: user.avatar }, 'Avatar updated');
  } catch (err) { next(err); }
}

const setLevelSchema = z.object({
  richLevel:  z.number().int().min(1).max(100).optional(),
  richXp:     z.number().int().nonnegative().optional(),
  charmLevel: z.number().int().min(1).max(100).optional(),
  charmXp:    z.number().int().nonnegative().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' });

export async function setLevel(req: Request, res: Response, next: NextFunction) {
  try {
    const data = setLevelSchema.parse(req.body);
    const level = await usersService.forceSetLevel(req.params.id, data, req.admin!.id, req.ip!);
    ok(res, level, 'Level updated');
  } catch (err) { next(err); }
}

const specialHakaIdLevelSchema = z.object({
  level: z.enum(['SSS', 'SS', 'S', 'A', 'B']),
});

export async function setSpecialHakaIdLevel(req: Request, res: Response, next: NextFunction) {
  try {
    const { level } = specialHakaIdLevelSchema.parse(req.body);
    const result = await usersService.forceSetSpecialHakaIdLevel(
      req.admin!.id,
      req.params.id,
      level,
      req.ip,
    );
    ok(res, result, 'Special HAKA ID tier updated');
  } catch (err) { next(err); }
}

export async function setHostStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = z.object({
      isVerifiedHost: z.boolean().optional(),
      isPremiumHost:  z.boolean().optional(),
    }).refine(d => Object.keys(d).length > 0, { message: 'At least one field required' }).parse(req.body);
    ok(res, await usersService.setHostStatus(req.params.id, data, req.admin!.id, req.ip!), 'Host status updated');
  } catch (err) { next(err); }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { newPassword } = z.object({
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    }).parse(req.body);
    await usersService.resetUserPassword(req.params.id, newPassword, req.admin!.id, req.ip!);
    ok(res, null, 'Password reset successfully');
  } catch (err) { next(err); }
}

export async function sendLoginOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z.object({
      channel: z.enum(['sms', 'whatsapp']).optional(),
    }).parse(req.body ?? {});
    const result = await usersService.sendLoginOtp(
      req.params.id,
      req.admin!.id,
      req.ip!,
      body.channel ?? 'sms',
    );
    ok(res, result, `OTP sent to ${result.phoneMasked}`);
  } catch (err) { next(err); }
}

export async function getSuperAdminPower(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await usersService.getSuperAdminPower(req.params.id));
  } catch (err) { next(err); }
}

export async function setSuperAdminPower(req: Request, res: Response, next: NextFunction) {
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    ok(
      res,
      await usersService.setSuperAdminPower(req.params.id, enabled, req.admin!.id, req.ip!),
      enabled ? 'Super admin power enabled' : 'Super admin power disabled',
    );
  } catch (err) { next(err); }
}

export async function resetFaceVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const { resetFaceVerification: resetFn } = await import('../../face-verification/face-verification.service');
    ok(
      res,
      await resetFn(req.params.id, req.admin!.id, req.ip!),
      'Face verification reset',
    );
  } catch (err) { next(err); }
}

// ── Invitation bind record ────────────────────────────────────────────────────

export async function getUserInvitations(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await usersService.getUserInvitations(req.params.id));
  } catch (err) { next(err); }
}

// ── Profile background pass (store items) ────────────────────────────────────

export async function getUserStoreItems(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await usersService.getUserStoreItems(req.params.id));
  } catch (err) { next(err); }
}

const grantStoreItemSchema = z.object({
  itemId: z.string().uuid(),
  durationDays: z.number().int().min(0).nullable().default(null),
});

export async function grantStoreItem(req: Request, res: Response, next: NextFunction) {
  try {
    const { itemId, durationDays } = grantStoreItemSchema.parse(req.body);
    ok(res, await usersService.grantStoreItemToUser(req.admin!.id, req.params.id, itemId, durationDays, req.ip));
  } catch (err) { next(err); }
}

export async function removeStoreItem(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await usersService.removeStoreItemFromUser(req.admin!.id, req.params.id, req.params.userStoreItemId, req.ip));
  } catch (err) { next(err); }
}
