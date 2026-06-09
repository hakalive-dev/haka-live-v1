import { Router } from 'express';
import * as ctrl from './admin-targets.controller';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types/roles';

const router = Router();
router.get('/', requirePermission(PERMISSIONS.ANALYTICS_VIEW), ctrl.get);
router.put('/', requirePermission(PERMISSIONS.TARGET_MANAGE),  ctrl.upsert);
export default router;
