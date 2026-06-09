import { Router } from 'express';
import * as ctrl from './admin-hierarchy.controller';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types/roles';

const router = Router();
router.get('/admins',       requirePermission(PERMISSIONS.ADMIN_VIEW),   ctrl.listAdmins);
router.get('/admins/:id/withdrawal-freeze', requirePermission(PERMISSIONS.PAYMENT_MANAGE), ctrl.getWithdrawalFreeze);
router.post('/admins/:id/withdrawal-freeze', requirePermission(PERMISSIONS.PAYMENT_MANAGE), ctrl.setWithdrawalFreeze);
router.post('/admins/transfer-agencies', requirePermission(PERMISSIONS.AGENCY_MANAGE), ctrl.transferAgencies);
router.post('/assign-bd',   requirePermission(PERMISSIONS.ADMIN_CREATE), ctrl.assignBd);
router.post('/transfer-bd', requirePermission(PERMISSIONS.ADMIN_CREATE), ctrl.transferBd);
export default router;
