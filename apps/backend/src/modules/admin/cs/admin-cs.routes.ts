import { Router } from 'express';
import * as ctrl from './admin-cs.controller';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types/roles';

const router = Router();
router.get('/',               requirePermission(PERMISSIONS.BD_VIEW),   ctrl.listCs);
router.get('/:id',            requirePermission(PERMISSIONS.BD_VIEW),   ctrl.getCsDetail);
router.delete('/:id',         requirePermission(PERMISSIONS.BD_MANAGE), ctrl.suspendCs);
router.patch('/:id/activate', requirePermission(PERMISSIONS.BD_MANAGE), ctrl.reactivateCs);
export default router;
