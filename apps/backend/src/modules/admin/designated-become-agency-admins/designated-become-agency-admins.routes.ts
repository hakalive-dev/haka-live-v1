import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './designated-become-agency-admins.controller';

const router = Router();

router.get('/', requirePermission('agency.view'), ctrl.list);
router.post('/', requirePermission('agency.manage'), ctrl.create);
router.patch('/:id', requirePermission('agency.manage'), ctrl.update);
router.delete('/:id', requirePermission('agency.manage'), ctrl.remove);

export default router;
