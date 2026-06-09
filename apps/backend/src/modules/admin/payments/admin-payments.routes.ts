import { Router } from 'express';
import * as ctrl from './admin-payments.controller';
import * as payrollAgentsCtrl from './admin-payroll-agents.controller';
import * as currencyCtrl from './admin-currency.controller';
import * as sellerRechargeConfigCtrl from './seller-recharge-config.controller';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import { PERMISSIONS } from '../../../shared-types';

const router = Router();

// ── Currency rates ────────────────────────────────────────────────────────────
router.get   ('/currencies',                requirePermission(PERMISSIONS.PAYMENT_VIEW),   currencyCtrl.list);
router.post  ('/currencies',                requirePermission(PERMISSIONS.PAYMENT_MANAGE), currencyCtrl.upsert);
router.post  ('/currencies/import',         requirePermission(PERMISSIONS.PAYMENT_MANAGE), currencyCtrl.importAll);
router.post  ('/currencies/bulk-activate',  requirePermission(PERMISSIONS.PAYMENT_MANAGE), currencyCtrl.bulkActivate);
router.delete('/currencies/:countryCode',   requirePermission(PERMISSIONS.PAYMENT_MANAGE), currencyCtrl.remove);
router.post  ('/currencies/sync',           requirePermission(PERMISSIONS.PAYMENT_MANAGE), currencyCtrl.sync);


router.get('/wallets',                          requirePermission(PERMISSIONS.PAYMENT_VIEW),   ctrl.listWallets);
router.get('/wallets/user/:userId',             requirePermission(PERMISSIONS.PAYMENT_VIEW),   ctrl.getWalletByUserId);
router.post('/wallets/user/:userId/adjust',     requirePermission(PERMISSIONS.PAYMENT_MANAGE), ctrl.adjustBalance);
router.get('/transactions',                     requirePermission(PERMISSIONS.PAYMENT_VIEW),   ctrl.listWalletTransactions);
router.get('/purchases/summary',                requirePermission(PERMISSIONS.PAYMENT_VIEW),   ctrl.purchasesSummary);
router.get('/purchases/export',                 requirePermission(PERMISSIONS.PAYMENT_VIEW),   ctrl.purchasesExport);
router.get('/purchases',                        requirePermission(PERMISSIONS.PAYMENT_VIEW),   ctrl.listPaymentTransactions);
router.get('/withdrawals',                      requirePermission(PERMISSIONS.PAYMENT_VIEW),   ctrl.listWithdrawals);
router.get('/withdrawals/payroll-agents',       requirePermission(PERMISSIONS.PAYMENT_VIEW),   ctrl.listPayrollAgents);
router.post('/withdrawals/:id/assign',          requirePermission(PERMISSIONS.WITHDRAWAL_APPROVE), ctrl.assignWithdrawal);
router.post('/withdrawals/:id/verify-proof',  requirePermission(PERMISSIONS.WITHDRAWAL_APPROVE), ctrl.verifyWithdrawalProof);
router.post('/withdrawals/:id/freeze',        requirePermission(PERMISSIONS.WITHDRAWAL_APPROVE), ctrl.freezeWithdrawal);
router.post('/withdrawals/:id/dispute',       requirePermission(PERMISSIONS.WITHDRAWAL_APPROVE), ctrl.disputeWithdrawal);
router.post('/withdrawals/:id/approve',         requirePermission(PERMISSIONS.WITHDRAWAL_APPROVE), ctrl.approveWithdrawal);
router.post('/withdrawals/:id/reject',          requirePermission(PERMISSIONS.WITHDRAWAL_APPROVE), ctrl.rejectWithdrawal);

router.get('/payroll-agents',                   requirePermission(PERMISSIONS.PAYMENT_VIEW),   payrollAgentsCtrl.list);
router.post('/payroll-agents',                  requirePermission(PERMISSIONS.PAYMENT_MANAGE), payrollAgentsCtrl.create);
router.patch('/payroll-agents/:userId',         requirePermission(PERMISSIONS.PAYMENT_MANAGE), payrollAgentsCtrl.update);

router.get('/seller-recharge-settings',              requirePermission(PERMISSIONS.PAYMENT_VIEW),   sellerRechargeConfigCtrl.getConfig);
router.put('/seller-recharge-settings',              requirePermission(PERMISSIONS.PAYMENT_MANAGE), sellerRechargeConfigCtrl.updateConfig);

router.get('/seller-recharges',                      requirePermission(PERMISSIONS.PAYMENT_VIEW),   ctrl.listSellerRecharges);
router.post('/seller-recharges/:id/approve',         requirePermission(PERMISSIONS.PAYMENT_MANAGE), ctrl.approveSellerRecharge);
router.post('/seller-recharges/:id/reject',          requirePermission(PERMISSIONS.PAYMENT_MANAGE), ctrl.rejectSellerRecharge);

router.get('/seller-exchanges',                      requirePermission(PERMISSIONS.PAYMENT_VIEW),   ctrl.listSellerExchangeRequests);
router.post('/seller-exchanges/:id/approve',         requirePermission(PERMISSIONS.PAYMENT_MANAGE), ctrl.approveSellerExchange);
router.post('/seller-exchanges/:id/reject',          requirePermission(PERMISSIONS.PAYMENT_MANAGE), ctrl.rejectSellerExchange);

export default router;
