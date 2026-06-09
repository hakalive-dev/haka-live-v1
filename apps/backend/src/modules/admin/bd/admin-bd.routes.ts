import { Router } from 'express';
import * as ctrl from './admin-bd.controller';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types/roles';

const router = Router();
router.post('/',                 requirePermission(PERMISSIONS.BD_MANAGE), ctrl.createBd);
router.get('/',                  requirePermission(PERMISSIONS.BD_VIEW),   ctrl.listBds);
router.get('/:id',               requirePermission(PERMISSIONS.BD_VIEW),   ctrl.getBdDetail);
router.post('/assign-agency',    requirePermission(PERMISSIONS.BD_MANAGE), ctrl.assignAgency);
router.post('/transfer-agency',  requirePermission(PERMISSIONS.BD_MANAGE), ctrl.transferAgency);
router.delete('/:id',            requirePermission(PERMISSIONS.BD_MANAGE), ctrl.suspendBd);
router.patch('/:id/activate',    requirePermission(PERMISSIONS.BD_MANAGE), ctrl.reactivateBd);
export default router;
