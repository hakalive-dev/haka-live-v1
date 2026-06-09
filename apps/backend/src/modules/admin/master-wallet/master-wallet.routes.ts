import { Router } from 'express';
import { requireAdminRole } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './master-wallet.controller';

const router = Router();

router.get('/',             ctrl.getOverview);
router.get('/transactions', ctrl.listTransactions);

// Mint — 2-step approval, super_admin only
router.get('/mint-requests',                requireAdminRole('super_admin'), ctrl.listMintRequests);
router.post('/mint-requests',               requireAdminRole('super_admin'), ctrl.requestMint);
router.post('/mint-requests/:id/approve',   requireAdminRole('super_admin'), ctrl.approveMint);
router.post('/mint-requests/:id/reject',    requireAdminRole('super_admin'), ctrl.rejectMint);

// Transfer — super_admin only
router.post('/transfer',    requireAdminRole('super_admin'), ctrl.transfer);

// Credit/deduct user — any admin
router.post('/credit-user', ctrl.creditUser);
router.post('/deduct-user', ctrl.deductUser);

// Reversal — any admin (guarded at service layer)
router.post('/transactions/:id/reverse', ctrl.reverseTransaction);

export default router;
