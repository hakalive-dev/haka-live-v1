import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './lucky-gifts.controller';

const router = Router();

// Game config singleton (id = "singleton")
router.get('/setting',    requirePermission('gift.manage'), ctrl.getSetting);
router.patch('/setting',  requirePermission('gift.manage'), ctrl.updateSetting);

// Draw log + stats
router.get('/draws',      requirePermission('gift.manage'), ctrl.listDraws);
router.get('/stats',      requirePermission('gift.manage'), ctrl.getStats);

export default router;
