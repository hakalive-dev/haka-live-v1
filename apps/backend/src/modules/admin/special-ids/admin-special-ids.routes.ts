import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types';
import * as ctrl from './admin-special-ids.controller';

const router = Router();

router.get   ('/',                    requirePermission(PERMISSIONS.SPECIAL_ID_MANAGE), ctrl.list);
router.post  ('/',                    requirePermission(PERMISSIONS.SPECIAL_ID_MANAGE), ctrl.create);
router.get   ('/check/:candidate',    requirePermission(PERMISSIONS.SPECIAL_ID_MANAGE), ctrl.checkAvailability);
router.patch ('/:id',                 requirePermission(PERMISSIONS.SPECIAL_ID_MANAGE), ctrl.update);
router.delete('/:id/revoke',           requirePermission(PERMISSIONS.SPECIAL_ID_MANAGE), ctrl.revoke);
router.delete('/:id',                 requirePermission(PERMISSIONS.SPECIAL_ID_MANAGE), ctrl.remove);

export default router;
