import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './wallet.controller';

const router = Router();

router.use(authenticate);

router.get('/',              ctrl.getBalance);
router.get('/transactions',  ctrl.getTransactions);
router.get('/bean-records',  ctrl.getBeanRecords);
router.get('/withdrawals',   ctrl.getWithdrawals);
router.get('/withdrawals/:id', ctrl.getWithdrawalDetail);
router.post('/exchange',     ctrl.exchange);
router.post('/topup',        ctrl.topUp);
router.post('/withdraw',                  ctrl.withdraw);
router.post('/withdrawals/:id/confirm-receipt', ctrl.confirmWithdrawalReceipt);
router.post('/withdrawals/:id/dispute',   ctrl.disputeWithdrawal);

export default router;
