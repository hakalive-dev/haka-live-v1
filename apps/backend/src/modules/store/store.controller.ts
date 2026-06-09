import { Request, Response, NextFunction } from 'express';
import { storeService } from './store.service';
import { ok, fail } from '../../utils/response';

export const storeController = {
  getCategories(_req: Request, res: Response) {
    return ok(res, storeService.getCategories());
  },

  async getItems(req: Request, res: Response, next: NextFunction) {
    try {
      const category = req.query.category as string | undefined;
      const items = await storeService.getItems(category);
      return ok(res, items);
    } catch (err) {
      next(err);
    }
  },

  async purchase(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { itemId, item_id } = req.body;
      const id = itemId ?? item_id;
      if (!id) return fail(res, 'itemId required');
      const result = await storeService.purchase(userId, id);
      return ok(res, result, '', 201);
    } catch (err: any) {
      const clientErrors = [
        'Insufficient coins',
        'Item not found',
        'Special IDs must be purchased via the Special ID store',
      ];
      if (clientErrors.includes(err.message)) {
        return fail(res, err.message);
      }
      next(err);
    }
  },

  async sendItem(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { itemId, recipientHakaId } = req.body;
      if (!itemId) return fail(res, 'itemId required');
      if (!recipientHakaId) return fail(res, 'recipientHakaId required');
      const result = await storeService.sendItem(userId, itemId, recipientHakaId);
      return ok(res, result, 'Item sent', 201);
    } catch (err: any) {
      if (err.statusCode) return fail(res, err.message, err.statusCode);
      next(err);
    }
  },

  async getMyItems(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const category = req.query.category as string | undefined;
      const items = await storeService.getMyItems(userId, category);
      return ok(res, items);
    } catch (err) {
      next(err);
    }
  },

  async equip(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { userStoreItemId, user_store_item_id } = req.body;
      const id = userStoreItemId ?? user_store_item_id;
      if (!id) return fail(res, 'userStoreItemId required');
      const result = await storeService.equip(userId, id);
      return ok(res, result);
    } catch (err: any) {
      if (err.message === 'Item not found') return fail(res, err.message, 404);
      next(err);
    }
  },

  async unequip(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { userStoreItemId, user_store_item_id } = req.body;
      const id = userStoreItemId ?? user_store_item_id;
      if (!id) return fail(res, 'userStoreItemId required');
      const result = await storeService.unequip(userId, id);
      return ok(res, result);
    } catch (err: any) {
      if (err.message === 'Item not found') return fail(res, err.message, 404);
      next(err);
    }
  },

  // ── Special ID Store ────────────────────────────────────────────────────

  async getSpecialIds(req: Request, res: Response, next: NextFunction) {
    try {
      const level = req.query.level as string | undefined;
      const items = await storeService.getSpecialIds(level);
      return ok(res, items);
    } catch (err) {
      next(err);
    }
  },

  async purchaseSpecialId(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { specialIdId } = req.body;
      if (!specialIdId) return fail(res, 'specialIdId required');
      const result = await storeService.purchaseSpecialId(userId, specialIdId);
      return ok(res, result, 'Special ID purchased', 201);
    } catch (err: any) {
      if (err.statusCode) return fail(res, err.message, err.statusCode);
      next(err);
    }
  },

  async getMySpecialIds(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const items = await storeService.getMySpecialIds(userId);
      return ok(res, items);
    } catch (err) {
      next(err);
    }
  },

  async activateSpecialId(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { inventoryId } = req.body;
      if (!inventoryId) return fail(res, 'inventoryId required');
      const result = await storeService.activateSpecialId(userId, inventoryId);
      return ok(res, result, 'Special ID activated');
    } catch (err: any) {
      if (err.statusCode) return fail(res, err.message, err.statusCode);
      next(err);
    }
  },

  async sendSpecialId(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { specialIdId, recipientHakaId } = req.body;
      if (!specialIdId) return fail(res, 'specialIdId required');
      if (!recipientHakaId) return fail(res, 'recipientHakaId required');
      const result = await storeService.sendSpecialId(userId, specialIdId, recipientHakaId);
      return ok(res, result, 'Special ID sent', 201);
    } catch (err: any) {
      if (err.statusCode) return fail(res, err.message, err.statusCode);
      next(err);
    }
  },

  async deactivateSpecialId(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const result = await storeService.deactivateSpecialId(userId);
      return ok(res, result);
    } catch (err: any) {
      if (err.statusCode) return fail(res, err.message, err.statusCode);
      next(err);
    }
  },
};
