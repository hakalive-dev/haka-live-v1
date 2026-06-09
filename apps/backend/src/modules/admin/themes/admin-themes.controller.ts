import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as themesService from './admin-themes.service';
import { ok, created } from '../../../utils/response';

// Multer — memory storage, two optional fields, max 50 MB each
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export const uploadThemeFiles = upload.fields([
  { name: 'backgroundImage', maxCount: 1 },
  { name: 'svga', maxCount: 1 },
]);

// backgroundImageUrl and svgaUrl are NOT accepted from the body —
// they are set exclusively via file upload (Deviation 4).
const themeSchema = z.object({
  name: z.string().min(1),
  gradientFrom: z.string().optional(),
  gradientTo: z.string().optional(),
  accentColor: z.string().optional(),
  chatBubbleColor: z.string().optional(),
  storeItemId: z.string().uuid().optional().nullable(),
  coinCost: z.coerce.number().int().min(0).optional(),
});

function extractFiles(req: Request): themesService.ThemeFiles {
  const fields = req.files as Record<string, Express.Multer.File[]> | undefined;
  return {
    backgroundImage: fields?.backgroundImage?.[0],
    svga: fields?.svga?.[0],
  };
}

export async function listThemes(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await themesService.listThemes());
  } catch (err) { next(err); }
}

export async function createTheme(req: Request, res: Response, next: NextFunction) {
  try {
    const data = themeSchema.parse(req.body);
    const files = extractFiles(req);
    const theme = await themesService.createTheme(data, files, req.admin!.id, req.ip ?? '');
    created(res, theme, 'Theme created');
  } catch (err) { next(err); }
}

export async function updateTheme(req: Request, res: Response, next: NextFunction) {
  try {
    const data = themeSchema.partial().parse(req.body);
    const files = extractFiles(req);
    const theme = await themesService.updateTheme(req.params.id, data, files, req.admin!.id, req.ip ?? '');
    ok(res, theme, 'Theme updated');
  } catch (err) { next(err); }
}

export async function deleteTheme(req: Request, res: Response, next: NextFunction) {
  try {
    await themesService.deleteTheme(req.params.id, req.admin!.id, req.ip ?? '');
    ok(res, null, 'Theme deleted');
  } catch (err) { next(err); }
}
