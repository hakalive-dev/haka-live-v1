import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { adminUpload } from '../../utils/upload';
import { requirePayrollAgent } from './payroll-agent.middleware';
import * as ctrl from './payroll-agent.controller';

const router = Router();

router.use(authenticate, requirePayrollAgent);

router.get('/me', ctrl.getMe);
router.patch('/me', ctrl.patchMe);
router.get('/summary', ctrl.getSummary);
router.get('/withdrawals', ctrl.listMyWithdrawals);
router.get('/withdrawals/:id', ctrl.getWithdrawal);
router.post(
  '/withdrawals/:id/proof',
  adminUpload.single('proof'),
  ctrl.submitProof,
);
router.post('/withdrawals/:id/accept',  ctrl.accept);
router.post('/withdrawals/:id/decline', ctrl.decline);

export default router;
