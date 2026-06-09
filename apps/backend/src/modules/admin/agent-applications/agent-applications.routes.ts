import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './agent-applications.controller';

const router = Router();

router.get('/',             requirePermission('agency.view'), ctrl.list);
router.post('/:id/approve', requirePermission('agency.view'), ctrl.approve);
router.post('/:id/reject',  requirePermission('agency.view'), ctrl.reject);

export default router;
