import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ok, created } from '../../../utils/response';
import * as teamAnnouncementService from '../../chat/team-announcement.service';

const publishSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function publish(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, body } = publishSchema.parse(req.body);
    const adminId = (req as Request & { admin?: { id: string } }).admin?.id ?? null;
    const row = await teamAnnouncementService.publishTeamAnnouncement({
      title,
      body,
      adminId,
    });
    created(res, row);
  } catch (err) {
    next(err);
  }
}

export async function listAnnouncements(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit } = listSchema.parse(req.query);
    const data = await teamAnnouncementService.listTeamAnnouncements(page, limit);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}
