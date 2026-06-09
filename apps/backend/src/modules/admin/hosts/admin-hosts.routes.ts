import { Router } from 'express';
import * as ctrl from './admin-hosts.controller';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types/roles';

const router = Router();
router.get('/active-count', requirePermission(PERMISSIONS.HOST_VIEW), ctrl.activeCount);
router.get('/multi-agency-abuse', requirePermission(PERMISSIONS.HOST_ABUSE_VIEW), ctrl.listMultiAgencyAbuse);
router.get('/',             requirePermission(PERMISSIONS.HOST_VIEW), ctrl.listHosts);
router.get('/:hostId/ownership', requirePermission(PERMISSIONS.HOST_OWNERSHIP_VIEW), ctrl.getHostOwnership);
router.get('/:hostId/revenue', requirePermission(PERMISSIONS.HOST_REVENUE_VIEW), ctrl.getHostRevenue);
router.post('/:hostId/transfer-agency', requirePermission(PERMISSIONS.HOST_TRANSFER_AGENCY), ctrl.transferHostAgency);
router.post('/:hostId/remove-agency', requirePermission(PERMISSIONS.HOST_REMOVE_AGENCY), ctrl.removeHostAgency);
router.post('/:hostId/ban-task',     requirePermission(PERMISSIONS.HOST_MANAGE), ctrl.banHostTask);
router.post('/:hostId/release-task', requirePermission(PERMISSIONS.HOST_MANAGE), ctrl.releaseHostTask);
export default router;
