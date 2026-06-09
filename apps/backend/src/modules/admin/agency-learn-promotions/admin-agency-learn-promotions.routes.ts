import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './admin-agency-learn-promotions.controller';

const router = Router();

router.get('/', requirePermission('agency.view'), ctrl.listPromotions);
router.get('/:id', requirePermission('agency.view'), ctrl.getPromotion);
router.post('/', requirePermission('agency.manage'), ctrl.uploadPromotionImage, ctrl.createPromotion);
router.patch('/:id', requirePermission('agency.manage'), ctrl.uploadPromotionImage, ctrl.updatePromotion);
router.delete('/:id', requirePermission('agency.manage'), ctrl.deletePromotion);
router.patch('/:id/toggle', requirePermission('agency.manage'), ctrl.togglePromotion);

export default router;
