import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as supportService from './admin-support.service';
import { ok } from '../../../utils/response';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
});

const replySchema = z.object({
  adminReply: z.string().min(1).max(2000),
});

/** GET /admin/support/tickets */
export async function listTickets(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, status } = paginationSchema.parse(req.query);
    const data = await supportService.listTickets(page, limit, status);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /admin/support/tickets/:id/reply */
export async function replyTicket(req: Request, res: Response, next: NextFunction) {
  try {
    const { adminReply } = replySchema.parse(req.body);
    const data = await supportService.replyTicket(req.params.id, adminReply, req.admin!.id);
    ok(res, data, 'Reply sent');
  } catch (err) { next(err); }
}

/** POST /admin/support/tickets/:id/close */
export async function closeTicket(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await supportService.closeTicket(req.params.id);
    ok(res, data, 'Ticket closed');
  } catch (err) { next(err); }
}

/** GET /admin/support/tickets/:id/screenshot/:index? — raw image (admin auth required) */
export async function getScreenshot(req: Request, res: Response, next: NextFunction) {
  try {
    const index = Math.max(0, parseInt(String(req.params.index ?? '0'), 10) || 0);
    const { buffer, mimeType } = await supportService.getTicketScreenshot(req.params.id, index);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) { next(err); }
}
