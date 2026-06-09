import { Router } from 'express';
import * as ctrl from './settings.controller';
import { requireAdminRole } from '../../../middleware/admin-auth.middleware';

const router = Router();

router.get('/',          ctrl.listSettings);
router.get('/:key',      ctrl.getSetting);
router.put('/:key',      requireAdminRole('super_admin'), ctrl.upsertSetting);
router.delete('/:key',  requireAdminRole('super_admin'), ctrl.deleteSetting);

export default router;
