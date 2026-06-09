import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types';
import * as ctrl from './admin-gifts.controller';

const router = Router();

router.get('/',              ctrl.listGifts);
router.get('/bulk/template', requirePermission(PERMISSIONS.GIFT_MANAGE), ctrl.downloadBulkTemplate);
router.post('/bulk',         requirePermission(PERMISSIONS.GIFT_MANAGE), ctrl.bulkUploadMiddleware, ctrl.bulkImportGifts);
router.post('/',             requirePermission(PERMISSIONS.GIFT_MANAGE), ctrl.uploadMiddleware, ctrl.createGift);
router.patch('/:id',         requirePermission(PERMISSIONS.GIFT_MANAGE), ctrl.uploadMiddleware, ctrl.updateGift);
router.get('/transactions',  ctrl.listGiftTransactions);

export default router;
