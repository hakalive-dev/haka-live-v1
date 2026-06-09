import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import * as service from './admin-agency-learn-promotions.service';
import { ok, created } from '../../../utils/response';
import { uploadToStorage } from '../../../utils/storage';

export const uploadPromotionImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('imageFile');

const httpUrlSchema = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'linkUrl must use http or https');

const optionalLinkUrl = z
  .string()
  .optional()
  .default('')
  .transform((s) => s.trim())
  .refine((s) => s === '' || /^https?:\/\//i.test(s), 'linkUrl must use http or https')
  .refine((s) => {
    if (s === '') return true;
    try {
      httpUrlSchema.parse(s);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid linkUrl');

const promotionSchema = z.object({
  imageUrl: z.string().url().optional(),
  title: z.string().min(1),
  description: z.string().default(''),
  linkUrl: optionalLinkUrl,
  viewCount: z.coerce.number().int().min(0).default(0),
  likeCount: z.coerce.number().int().min(0).default(0),
  tag: z.string().default('Original'),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(true),
});

async function resolveImageUrl(req: Request, fallback?: string): Promise<string | undefined> {
  if (req.file) {
    const ext = req.file.originalname.split('.').pop() || 'png';
    return await uploadToStorage(
      req.file.buffer,
      `${uuid()}-agency-learn-promo.${ext}`,
      req.file.mimetype,
    );
  }
  return fallback;
}

export async function listPromotions(req: Request, res: Response, next: NextFunction) {
  try {
    const activeOnly = req.query.active === 'true';
    ok(res, await service.listAgencyLearnPromotions(activeOnly));
  } catch (err) {
    next(err);
  }
}

export async function getPromotion(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await service.getAgencyLearnPromotion(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function createPromotion(req: Request, res: Response, next: NextFunction) {
  try {
    const data = promotionSchema.parse(req.body);
    const imageUrl = await resolveImageUrl(req, data.imageUrl);
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'imageFile or imageUrl is required',
      });
    }
    const row = await service.createAgencyLearnPromotion(
      { ...data, imageUrl },
      req.admin!.id,
      req.ip ?? '',
    );
    created(res, row, 'Learn promotion created');
  } catch (err) {
    next(err);
  }
}

export async function updatePromotion(req: Request, res: Response, next: NextFunction) {
  try {
    const data = promotionSchema.partial().parse(req.body);
    const uploadedUrl = await resolveImageUrl(req);
    const row = await service.updateAgencyLearnPromotion(
      req.params.id,
      {
        ...data,
        ...(uploadedUrl ? { imageUrl: uploadedUrl } : {}),
      },
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, row, 'Learn promotion updated');
  } catch (err) {
    next(err);
  }
}

export async function deletePromotion(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteAgencyLearnPromotion(req.params.id, req.admin!.id, req.ip ?? '');
    ok(res, null, 'Learn promotion deleted');
  } catch (err) {
    next(err);
  }
}

export async function togglePromotion(req: Request, res: Response, next: NextFunction) {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const row = await service.toggleAgencyLearnPromotion(
      req.params.id,
      isActive,
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, row);
  } catch (err) {
    next(err);
  }
}
