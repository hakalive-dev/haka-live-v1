import { Router } from 'express';
import * as ctrl from './admin-agencies.controller';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types/roles';

const router = Router();

router.get('/',                          ctrl.listAgencies);
router.post('/transfer-host',            ctrl.transferHost);
router.post('/:id/remove-host',          ctrl.removeHostFromAgency);
router.post('/:id/freeze-withdrawals',   requirePermission('risk.manage'), ctrl.freezeAgencyWithdrawals);
router.post('/:id/unfreeze-withdrawals', requirePermission('risk.manage'), ctrl.unfreezeAgencyWithdrawals);
router.get('/:id',                       ctrl.getAgencyDetail);
router.post('/',                         requirePermission(PERMISSIONS.AGENCY_CREATE), ctrl.createAgency);
router.patch('/:id',                     ctrl.updateAgency);
router.delete('/:id',                    ctrl.deleteAgency);
router.patch('/:id/status',              ctrl.setAgencyStatus);
router.post('/:id/assign-admin',         ctrl.assignAdmin);
router.post('/:id/remove-admin',         ctrl.removeAdminAssignment);
router.get('/:id/analytics',            ctrl.getAgencyAnalytics);
router.get('/:id/host-retention',      ctrl.getAgencyHostRetention);
router.get('/:id/performance',          ctrl.getAgencyPerformance);
router.get('/:id/wallet',               ctrl.getAgencyWallet);

export default router;
