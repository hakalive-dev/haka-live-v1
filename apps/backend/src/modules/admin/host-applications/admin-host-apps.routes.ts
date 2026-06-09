import { Router } from 'express';
import * as ctrl from './admin-host-apps.controller';

const router = Router();

router.get('/',               ctrl.listHostApplications);
router.post('/:id/approve',   ctrl.approveApplication);
router.post('/:id/reject',    ctrl.rejectApplication);

export default router;
