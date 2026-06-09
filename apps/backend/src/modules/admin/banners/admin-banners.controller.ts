import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import * as bannersService from './admin-banners.service';
import { ok, created } from '../../../utils/response';
import { uploadToStorage } from '../../../utils/storage';


// Multer — memory storage, max 10 MB per image
export const uploadBannerImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('imageFile');

// Multipart sends everything as strings — use coercion where needed
const bannerSchema = z.object({
  imageUrl: z.string().url().optional(),
  title: z.string().min(1),
  subtitle: z.string().default(''),
  redirectType: z.enum(['event', 'external', 'user_profile', 'game']),
  redirectValue: z.string().default(''),
  placement: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/).default('home_top'),
  priority: z.coerce.number().int().min(1).max(10).default(5),
  isActive: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(true),
  startDate: z.string().min(1).refine((s) => !isNaN(new Date(s).getTime()), 'Invalid startDate'),
  endDate: z.string().min(1).refine((s) => !isNaN(new Date(s).getTime()), 'Invalid endDate'),
});

export async function listBanners(req: Request, res: Response, next: NextFunction) {
  try {
    const activeOnly = req.query.active === 'true';
    const placement = typeof req.query.placement === 'string' ? req.query.placement : undefined;
    ok(res, await bannersService.listBanners(activeOnly, placement));
  } catch (err) { next(err); }
}

export async function getBanner(req: Request, res: Response, next: NextFunction) {
  try { ok(res, await bannersService.getBanner(req.params.id)); } catch (err) { next(err); }
}

async function resolveImageUrl(req: Request, fallback?: string): Promise<string | undefined> {
  if (req.file) {
    const ext = req.file.originalname.split('.').pop() || 'png';
    return await uploadToStorage(req.file.buffer, `${uuid()}-banner.${ext}`, req.file.mimetype);
  }
  return fallback;
}

export async function createBanner(req: Request, res: Response, next: NextFunction) {
  try {
    const data = bannerSchema.parse(req.body);
    const imageUrl = await resolveImageUrl(req, data.imageUrl);
    if (!imageUrl) return res.status(400).json({ success: false, data: null, message: 'imageFile or imageUrl is required' });

    const banner = await bannersService.createBanner(
      { ...data, imageUrl, startDate: new Date(data.startDate), endDate: new Date(data.endDate) },
      req.admin!.id,
      req.ip ?? '',
    );
    created(res, banner, 'Banner created');
  } catch (err) { next(err); }
}

export async function updateBanner(req: Request, res: Response, next: NextFunction) {
  try {
    const data = bannerSchema.partial().parse(req.body);
    const uploadedUrl = await resolveImageUrl(req);
    const banner = await bannersService.updateBanner(
      req.params.id,
      {
        ...data,
        ...(uploadedUrl ? { imageUrl: uploadedUrl } : {}),
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, banner, 'Banner updated');
  } catch (err) { next(err); }
}

export async function deleteBanner(req: Request, res: Response, next: NextFunction) {
  try {
    await bannersService.deleteBanner(req.params.id, req.admin!.id, req.ip ?? '');
    ok(res, null, 'Banner deleted');
  } catch (err) { next(err); }
}

export async function toggleBanner(req: Request, res: Response, next: NextFunction) {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const banner = await bannersService.toggleBanner(req.params.id, isActive, req.admin!.id, req.ip ?? '');
    ok(res, banner);
  } catch (err) { next(err); }
}
