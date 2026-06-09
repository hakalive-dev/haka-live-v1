import { Request, Response, NextFunction } from 'express';
import { searchService } from './search.service';
import { ok, fail } from '../../utils/response';

export const searchController = {
  async global(req: Request, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q ?? '').trim();
      if (!q) return ok(res, { users: [], rooms: [] });
      const type = (req.query.type as 'all' | 'users' | 'rooms') ?? 'all';
      if (!['all', 'users', 'rooms'].includes(type)) {
        return fail(res, 'type must be all | users | rooms');
      }
      const results = await searchService.global(q, type);
      return ok(res, results);
    } catch (err) {
      next(err);
    }
  },
};
