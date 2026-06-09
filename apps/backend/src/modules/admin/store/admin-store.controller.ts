import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { ok } from '../../../utils/response';
import { uploadToStorage } from '../../../utils/storage';
import * as service from './admin-store.service';
import { buildBulkTemplateZip, bulkImportStoreItemsFromZip, BULK_MAX_ZIP_BYTES } from './admin-store-bulk';

// Multer — memory storage, max 30 MB per file
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
}).fields([
  { name: 'imageFile', maxCount: 1 },
  { name: 'svgaFile',  maxCount: 1 },
]);

// Bulk ZIP upload (manifest.csv + assets)
export const bulkUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BULK_MAX_ZIP_BYTES },
}).single('zipFile');

/** Must match in-app store categories (see store.service.ts). */
const CATEGORIES = [
  'frame',
  'entry',
  'chat_bubble',
  'special_id',
  'profile_card',
  'mic_voice_wave',
  'dynamic_profile',
  'ring',
  'theme',
] as const;

const listSchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().positive().max(100).default(20),
  category: z.enum(CATEGORIES).optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  isForSale: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  search:   z.string().optional(),
});

// Use z.coerce for numeric fields — multipart sends everything as strings
const createSchema = z.object({
  name:         z.string().min(1),
  description:  z.string().optional(),
  image:        z.string().optional(),
  previewImage: z.string().optional(),
  category:     z.enum(CATEGORIES),
  level:        z.string().optional().default(''),
  coinCost:     z.coerce.number().int().nonnegative(),
  durationDays: z.coerce.number().int().nonnegative(),
  sortOrder:    z.coerce.number().int().optional(),
});

const updateSchema = createSchema.partial();

type UploadedFiles = { imageFile?: Express.Multer.File[]; svgaFile?: Express.Multer.File[] };

/**
 * Upload PNG + SVGA files to storage and return the resolved URLs.
 * SVGA stays in `image` for mobile animation playback; PNG/JPG is kept
 * separately as `previewImage` so the admin catalogue can show a thumbnail.
 */
async function uploadStoreItemFiles(
  files: UploadedFiles,
  category?: string,
): Promise<{ image?: string; previewImage?: string }> {
  const result: { image?: string; previewImage?: string } = {};
  const isChatBubble = category === 'chat_bubble';
  const pngUploadOpts = isChatBubble
    ? { maxDim: 4096, cacheControl: '31536000', immutable: true as const }
    : undefined;

  if (files.imageFile?.[0]) {
    const file = files.imageFile[0];
    const ext  = file.originalname.split('.').pop() || 'png';
    const url = await uploadToStorage(
      file.buffer,
      `store/${uuid()}-image.${ext}`,
      file.mimetype,
      undefined,
      undefined,
      pngUploadOpts,
    );
    // For static items (frames, etc.) the PNG/JPG is the primary asset.
    // If an SVGA is also provided, it will override `image` below.
    result.previewImage = url;
    result.image = url;
  }

  if (files.svgaFile?.[0]) {
    const file = files.svgaFile[0];
    result.image = await uploadToStorage(
      file.buffer,
      `store/${uuid()}-animation.svga`,
      'application/octet-stream',
    );
  }

  return result;
}

export async function downloadBulkTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const buf = buildBulkTemplateZip();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="store-bulk-template.zip"');
    res.send(buf);
  } catch (err) { next(err); }
}

export async function bulkImport(req: Request, res: Response, next: NextFunction) {
  try {
    const zip = (req as any).file as Express.Multer.File | undefined;
    if (!zip?.buffer || zip.buffer.length === 0) {
      throw new Error('No ZIP file uploaded');
    }
    const result = await bulkImportStoreItemsFromZip(
      (req as any).admin.id,
      zip.buffer,
      req.ip,
    );
    ok(res, result, 'Bulk import complete');
  } catch (err) { next(err); }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listSchema.parse(req.query);
    const result = await service.listStoreItems(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const files    = (req.files || {}) as UploadedFiles;
    const category = typeof req.body.category === 'string' ? req.body.category : undefined;
    const uploads  = await uploadStoreItemFiles(files, category);
    const data     = createSchema.parse({ ...req.body, ...uploads });
    const item     = await service.createStoreItem(data, (req as any).admin.id, req.ip!);
    ok(res, item, 'Store item created');
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const files    = (req.files || {}) as UploadedFiles;
    const category = typeof req.body.category === 'string' ? req.body.category : undefined;
    const uploads  = await uploadStoreItemFiles(files, category);
    const data     = updateSchema.parse({ ...req.body, ...uploads });
    const item    = await service.updateStoreItem(req.params.id, data, (req as any).admin.id, req.ip!);
    ok(res, item, 'Store item updated');
  } catch (err) { next(err); }
}

export async function toggle(req: Request, res: Response, next: NextFunction) {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const item = await service.toggleStoreItem(req.params.id, isActive, (req as any).admin.id, req.ip!);
    ok(res, item);
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteStoreItem(req.params.id, (req as any).admin.id, req.ip!);
    ok(res, null, 'Store item deleted');
  } catch (err) { next(err); }
}
