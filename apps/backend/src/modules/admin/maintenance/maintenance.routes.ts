import { Router } from 'express';
import * as ctrl from './maintenance.controller';
import { requireAdminRole } from '../../../middleware/admin-auth.middleware';

const router = Router();

// The kill switch is super_admin only. authenticateAdmin is applied where this
// router is mounted (admin.routes.ts); requireAdminRole enforces the role.
router.get('/',         requireAdminRole('super_admin'), ctrl.getStatus);
router.post('/enable',  requireAdminRole('super_admin'), ctrl.enable);
router.post('/disable', requireAdminRole('super_admin'), ctrl.disable);

export default router;
