import { Router } from 'express';
import { requirePermission, requireAdminRole } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types';
import * as ctrl from './admin-store.controller';
import * as extCtrl from './admin-store-ext.controller';
import { bulkUploadMiddleware, uploadMiddleware } from './admin-store.controller';

const router = Router();
const superAdmin = requireAdminRole('super_admin');
const storeManage = requirePermission(PERMISSIONS.STORE_MANAGE);

router.get('/', storeManage, ctrl.list);
router.get('/bulk/template', storeManage, ctrl.downloadBulkTemplate);
router.post('/bulk', storeManage, bulkUploadMiddleware, ctrl.bulkImport);
router.post('/', storeManage, uploadMiddleware, ctrl.create);
router.patch('/:id', storeManage, uploadMiddleware, ctrl.update);
router.patch('/:id/toggle', storeManage, ctrl.toggle);
router.delete('/:id', storeManage, ctrl.remove);

// Sale status + distribution (super admin only) — static paths before /:id
router.patch('/sale-status/bulk', superAdmin, extCtrl.bulkPatchSaleStatus);
router.post('/sale-status/schedule', superAdmin, extCtrl.createSaleSchedule);
router.get('/sale-status/schedules', superAdmin, extCtrl.listSaleSchedules);
router.delete('/sale-status/schedules/:scheduleId', superAdmin, extCtrl.cancelSaleSchedule);
router.get('/users/lookup', superAdmin, extCtrl.lookupUser);
router.get('/distributions/analytics', superAdmin, extCtrl.distributionAnalytics);
router.get('/distributions', superAdmin, extCtrl.listDistributions);

router.patch('/:id/sale-status', superAdmin, extCtrl.patchSaleStatus);
router.get('/:id/sale-status/history', superAdmin, extCtrl.getSaleStatusHistory);
router.post('/:id/send', superAdmin, extCtrl.sendItem);
router.post('/:id/distribute/bulk', superAdmin, extCtrl.bulkDistribute);

export default router;
