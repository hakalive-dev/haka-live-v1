import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as supportService from './support.service';
import { ok, created } from '../../utils/response';
import { uploadToStorage } from '../../utils/storage';
import { storageFilename } from '../../utils/upload';
import { AppError } from '../../middleware/error.middleware';

const createSchema = z.object({
  description: z.string().min(1).max(1000),
  screenshotUrls: z.array(z.string().min(1)).max(3).default([]),
  /** @deprecated — use screenshotUrls; kept for older app builds */
  screenshotUrl: z.string().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** POST /support/tickets */
export async function createTicket(req: Request, res: Response, next: NextFunction) {
  try {
    const { description, screenshotUrls, screenshotUrl } = createSchema.parse(req.body);
    const urls =
      screenshotUrls.length > 0
        ? screenshotUrls
        : screenshotUrl?.trim()
          ? [screenshotUrl.trim()]
          : [];
    const data = await supportService.createTicket(req.user!.id, description, urls);
    created(res, data, 'Support ticket submitted');
  } catch (err) { next(err); }
}

/** GET /support/tickets */
export async function getMyTickets(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await supportService.getMyTickets(req.user!.id, page, limit);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /support/upload — upload a single screenshot, returns { url } */
export async function uploadScreenshot(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new AppError('No file provided', 400);
    const filename = `support/${storageFilename(req.file.originalname)}`;
    const baseUrl = `${req.protocol}://${req.get('x-forwarded-host') ?? req.get('host')}`;
    const url = await uploadToStorage(req.file.buffer, filename, req.file.mimetype, 'support-screenshots', baseUrl);
    ok(res, { url });
  } catch (err) { next(err); }
}
