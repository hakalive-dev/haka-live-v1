import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { ok, fail } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';
import * as accountsService from '../accounts/accounts.service';
import * as usersService from '../users/users.service';
import { supabase } from '../../config/supabase';

// NOTE: Other avatar upload codepaths use the "admin-uploads" bucket with
// filenames under the `avatars/` prefix (see `uploadToStorage` default bucket).
// Keeping this consistent avoids 500s when an "avatars" bucket doesn't exist.
const AVATAR_BUCKET = 'admin-uploads';

const router = Router();
router.use(authenticate);

// ── PATCH /api/v1/profile/me ──────────────────────────────────────────────
const genderEnum = z.enum(['male', 'female', 'other', 'prefer_not_to_say', '']);

const profileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(200).optional(),
  avatar: z.string().url().optional(),
  country: z.string().min(2).max(80).optional(),
  city: z.string().max(80).optional(),
  gender: genderEnum.optional(),
  dateOfBirth: z.string().datetime().nullable().optional(),
  preferredWithdrawalCountryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
});

router.patch('/me', async (req, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }
    const { dateOfBirth, ...rest } = parsed.data;
    const user = await accountsService.updateProfile(req.user!.id, {
      ...rest,
      ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
    });
    ok(res, user, 'Profile updated');
  } catch (err) { next(err); }
});

// ── POST /api/v1/profile/location ─────────────────────────────────────────
const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

router.post('/location', async (req, res, next) => {
  try {
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors); return; }
    await usersService.updateLocation(req.user!.id, parsed.data.lat, parsed.data.lng);
    ok(res, null, 'Location updated');
  } catch (err) { next(err); }
});

// ── POST /api/v1/profile/avatar ───────────────────────────────────────────
// Returns a signed upload URL + the eventual public URL. Client uploads bytes
// to the signed URL, then PATCHes /profile/me with { avatar: publicUrl }.
const avatarSchema = z.object({
  ext: z.enum(['jpg', 'jpeg', 'png', 'webp']).default('jpg'),
});

router.post('/avatar', async (req, res, next) => {
  try {
    if (!supabase) throw new AppError('Storage not configured', 500);
    const { ext } = avatarSchema.parse(req.body ?? {});
    const path = `u/${req.user!.id}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) throw new AppError(`Failed to sign upload: ${error?.message ?? 'unknown'}`, 500);
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    ok(res, { uploadUrl: data.signedUrl, token: data.token, path, publicUrl: pub.publicUrl });
  } catch (err) { next(err); }
});

export default router;
