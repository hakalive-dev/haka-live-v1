import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import * as eventsService from './admin-events.service';
import type { EventInput } from './admin-events.service';
import { ok, created } from '../../../utils/response';
import { uploadToStorage } from '../../../utils/storage';

export const uploadEventBanner = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('bannerFile');

function parseJsonField<T>(schema: z.ZodType<T>) {
  return z.preprocess((v) => {
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return v; }
    }
    return v;
  }, schema);
}

const rewardSchema = z.object({
  rank: z.coerce.number().int().min(1),
  rewardType: z.enum(['coins', 'cash', 'badge', 'item']),
  rewardLabel: z.string().default(''),
  rewardAmount: z.coerce.number().min(0).default(0),
});

const visibilitySchema = z.object({
  homePage: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(true),
  bannerSlider: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  pushNotification: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});

const eventSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['competition', 'festival', 'lucky_draw', 'game_event']),
  startDate: z.string().min(1).refine((s) => !isNaN(new Date(s).getTime()), 'Invalid startDate'),
  endDate: z.string().min(1).refine((s) => !isNaN(new Date(s).getTime()), 'Invalid endDate'),
  bannerUrl: z.string().optional().default(''),
  description: z.string().default(''),
  entryRequirement: z.enum(['free', 'coins']).default('free'),
  entryCost: z.coerce.number().int().min(0).default(0),
  participationType: z.enum(['solo', 'team']).default('solo'),
  scoringSystem: z.enum(['gifts_received', 'coins_spent', 'game_wins']).default('gifts_received'),
  rankingPeriod: z.enum(['daily', 'weekly', 'global']).default('global'),
  visibility: parseJsonField(visibilitySchema).default({}),
  rewards: parseJsonField(z.array(rewardSchema)).default([]),
});

async function resolveBannerUrl(req: Request, fallback?: string): Promise<string | undefined> {
  if (req.file) {
    const ext = req.file.originalname.split('.').pop() || 'png';
    return await uploadToStorage(req.file.buffer, `${uuid()}-event-banner.${ext}`, req.file.mimetype);
  }
  return fallback;
}

export async function listEvents(req: Request, res: Response, next: NextFunction) {
  try {
    await eventsService.syncEventStatuses();
    const status = req.query.status as string | undefined;
    ok(res, await eventsService.listEvents(status));
  } catch (err) { next(err); }
}

export async function getEvent(req: Request, res: Response, next: NextFunction) {
  try { ok(res, await eventsService.getEvent(req.params.id)); } catch (err) { next(err); }
}

export async function createEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const data = eventSchema.parse(req.body);
    const bannerUrl = await resolveBannerUrl(req, data.bannerUrl || undefined);
    if (!bannerUrl) {
      return res.status(400).json({ success: false, data: null, message: 'bannerFile or bannerUrl is required' });
    }

    const event = await eventsService.createEvent(
      {
        ...data,
        bannerUrl,
        visibility: data.visibility as Record<string, boolean>,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      } as EventInput,
      req.admin!.id,
      req.ip ?? '',
    );
    created(res, event, 'Event created');
  } catch (err) { next(err); }
}

export async function updateEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const data = eventSchema.partial().parse(req.body);
    const uploadedUrl = await resolveBannerUrl(req);
    const event = await eventsService.updateEvent(
      req.params.id,
      {
        ...data,
        ...(uploadedUrl ? { bannerUrl: uploadedUrl } : {}),
        ...(data.visibility ? { visibility: data.visibility as Record<string, boolean> } : {}),
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      } as Partial<EventInput>,
      req.admin!.id,
      req.ip ?? '',
    );
    ok(res, event, 'Event updated');
  } catch (err) { next(err); }
}

export async function deleteEvent(req: Request, res: Response, next: NextFunction) {
  try {
    await eventsService.deleteEvent(req.params.id, req.admin!.id, req.ip ?? '');
    ok(res, null, 'Event deleted');
  } catch (err) { next(err); }
}
