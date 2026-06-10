import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import os from 'os';
import fs from 'fs';
import * as giftsService from './admin-gifts.service';
import { bulkImportGiftsFromZip, buildBulkTemplateZip } from './admin-gifts-bulk';
import { ok, created } from '../../../utils/response';
import { uploadToStorage } from '../../../utils/storage';
import { AppError } from '../../../middleware/error.middleware';
import { normalizeGiftCategory, GIFT_CATEGORIES } from '../../../shared-types/gifts';

// Multer — memory storage, max 30 MB per file
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
}).fields([
  { name: 'imageFile', maxCount: 1 },
  { name: 'svgaFile', maxCount: 1 },
]);

export const bulkUploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => cb(null, `${uuid()}-${file.originalname || 'gifts.zip'}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
}).single('zipFile');

// Coerce strings to numbers (multipart sends everything as strings)
const createGiftSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional().transform((s) => (typeof s === 'string' ? s.trim() : '')),
  coinCost: z.coerce.number().int().positive(),
  beanValue: z.coerce.number().int().positive(),
  category: z
    .string()
    .optional()
    .transform((s) => (s !== undefined ? normalizeGiftCategory(s, GIFT_CATEGORIES.BAG) : undefined)),
  animationType: z.string().optional(),
  soundKey: z.string().optional(),
  order: z.coerce.number().int().optional(),
  svgaAsset: z
    .preprocess((v) => {
      if (typeof v !== 'string') return v;
      const trimmed = v.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }, z.string().url())
    .optional(),
});

const updateGiftSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().optional(),
  coinCost: z.coerce.number().int().positive().optional(),
  beanValue: z.coerce.number().int().positive().optional(),
  category: z
    .string()
    .optional()
    .transform((s) => (s !== undefined ? normalizeGiftCategory(s, GIFT_CATEGORIES.BAG) : undefined)),
  animationType: z.string().optional(),
  soundKey: z.string().optional(),
  order: z.coerce.number().int().optional(),
  isActive: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
  svgaAsset: z
    .preprocess((v) => {
      if (typeof v !== 'string') return v;
      const trimmed = v.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }, z.string().url())
    .optional(),
});

const listTransactionsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  senderId: z.string().uuid().optional(),
  recipientId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  minCoinCost: z.coerce.number().int().min(0).optional(),
  isGame: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  sort: z.string().default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

type UploadedFiles = { imageFile?: Express.Multer.File[]; svgaFile?: Express.Multer.File[] };

function requestBaseUrl(req: Request): string | undefined {
  const host = req.get('x-forwarded-host') ?? req.get('host');
  const proto = req.get('x-forwarded-proto') ?? req.protocol;
  return host ? `${proto}://${host}` : undefined;
}

async function uploadGiftFiles(files: UploadedFiles, baseUrl?: string): Promise<{ image?: string; svgaAsset?: string }> {
  const result: { image?: string; svgaAsset?: string } = {};

  if (files.imageFile?.[0]) {
    const file = files.imageFile[0];
    const ext = file.originalname.split('.').pop() || 'png';
    result.image = await uploadToStorage(file.buffer, `${uuid()}-image.${ext}`, file.mimetype, undefined, baseUrl);
  }

  if (files.svgaFile?.[0]) {
    const file = files.svgaFile[0];
    result.svgaAsset = await uploadToStorage(file.buffer, `${uuid()}-animation.svga`, 'application/octet-stream', undefined, baseUrl);
  }

  return result;
}

export async function listGifts(req: Request, res: Response, next: NextFunction) {
  try {
    const gifts = await giftsService.listGifts();
    ok(res, gifts);
  } catch (err) { next(err); }
}

export async function createGift(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createGiftSchema.parse(req.body);
    const files = (req.files || {}) as UploadedFiles;
    const urls = await uploadGiftFiles(files, requestBaseUrl(req));
    const gift = await giftsService.createGift(req.admin!.id, { ...data, ...urls }, req.ip);
    created(res, gift, 'Gift created');
  } catch (err) { next(err); }
}

export async function updateGift(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateGiftSchema.parse(req.body);
    const files = (req.files || {}) as UploadedFiles;
    const urls = await uploadGiftFiles(files, requestBaseUrl(req));
    const gift = await giftsService.updateGift(req.admin!.id, req.params.id, { ...data, ...urls }, req.ip);
    ok(res, gift, 'Gift updated');
  } catch (err) { next(err); }
}

export async function listGiftTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const params = listTransactionsSchema.parse(req.query);
    const result = await giftsService.listGiftTransactions(params);
    ok(res, result);
  } catch (err) { next(err); }
}

export async function downloadBulkTemplate(_req: Request, res: Response, next: NextFunction) {
  try {
    const buffer = buildBulkTemplateZip();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="gifts-bulk-template.zip"');
    res.send(buffer);
  } catch (err) { next(err); }
}

export async function bulkImportGifts(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file?.path) {
      throw new AppError('zipFile is required', 400);
    }
    const result = await bulkImportGiftsFromZip(
      req.admin!.id,
      file.path,
      req.ip,
      requestBaseUrl(req),
    );
    try { fs.unlinkSync(file.path); } catch {}
    ok(res, result, `Imported ${result.created.length} gift(s)`);
  } catch (err) { next(err); }
}
