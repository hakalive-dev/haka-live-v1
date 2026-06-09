import { Router } from 'express';
import * as ctrl from './admin-regions.controller';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types/roles';

const router = Router();
router.get('/',         requirePermission(PERMISSIONS.ANALYTICS_VIEW), ctrl.list);
router.post('/',        requirePermission(PERMISSIONS.REGION_MANAGE),  ctrl.create);
router.patch('/:code',  requirePermission(PERMISSIONS.REGION_MANAGE),  ctrl.update);
router.delete('/:code', requirePermission(PERMISSIONS.REGION_MANAGE),  ctrl.remove);
export default router;
