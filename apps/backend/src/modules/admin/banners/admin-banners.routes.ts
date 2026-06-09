import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './admin-banners.controller';

const router = Router();

router.get('/',                requirePermission('banner.view'),   ctrl.listBanners);
router.get('/:id',             requirePermission('banner.view'),   ctrl.getBanner);
router.post('/',               requirePermission('banner.manage'), ctrl.uploadBannerImage, ctrl.createBanner);
router.patch('/:id',           requirePermission('banner.manage'), ctrl.uploadBannerImage, ctrl.updateBanner);
router.delete('/:id',          requirePermission('banner.manage'), ctrl.deleteBanner);
router.patch('/:id/toggle',    requirePermission('banner.manage'), ctrl.toggleBanner);

export default router;
