import { Router } from 'express';
import * as ctrl from './admin-seller-coins.controller';
import { requirePermission } from '../../../middleware/admin-auth.middleware';

const router = Router();

router.get('/',                                    ctrl.list);
router.get('/recharge-requests',                   ctrl.listRechargeRequests);
router.post('/recharge-requests/:id/approve',      ctrl.approveRecharge);
router.post('/recharge-requests/:id/reject',       ctrl.rejectRecharge);
router.get('/:userId',                             ctrl.detail);
router.post('/:userId/deduct',                     requirePermission('payment.manage'), ctrl.deductCoins);
router.post('/:userId/senior-tag',                 ctrl.assignSeniorTag);
router.delete('/:userId/senior-tag',               ctrl.removeSeniorTag);

export default router;
