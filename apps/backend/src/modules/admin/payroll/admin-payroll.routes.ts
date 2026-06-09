import { Router } from 'express';
import * as ctrl from './admin-payroll.controller';

const router = Router();

router.get('/',             ctrl.list);
router.post('/',            ctrl.create);
router.post('/:id/process', ctrl.process);
router.post('/:id/reject',  ctrl.reject);

export default router;
