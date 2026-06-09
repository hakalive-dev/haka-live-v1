import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './payments.controller';
import { coinSellerController as cs } from './coinSeller.controller';
import paymentMethodsRouter from '../payment-methods/payment-methods.routes';
import razorpayRouter from './razorpay/razorpay.routes';
import { adminUpload } from '../../utils/upload';

const router = Router();

router.get('/config', ctrl.getConfig); // public — no auth needed
router.get('/currencies', ctrl.getCurrencies); // public — no auth needed
router.get('/withdrawal-currencies', ctrl.getWithdrawalCurrencies); // public
router.get('/currencies/:countryCode', ctrl.getCurrencyByCountry); // public
router.use('/razorpay', razorpayRouter);
router.use(authenticate);
router.get('/withdrawal-methods', ctrl.getWithdrawalMethods);
router.get('/packages',    ctrl.getPackages);
router.post('/free-topup', ctrl.claimFreeTopUp);
router.get('/history',     ctrl.getPaymentHistory);

// ── Coin Seller sub-routes ────────────────────────────────────────────────────
router.get('/coin-sellers',               cs.listSellers);
router.get('/coin-sellers/me',            cs.getMe);
router.get('/coin-sellers/bootstrap',     cs.getBootstrap);
router.patch('/coin-sellers/me',          cs.updateMe);
router.get('/coin-sellers/me/balance',    cs.getBalance);
router.post('/coin-sellers/transfer',     cs.transfer);
router.post('/coin-sellers/recharge',     cs.recharge);
router.post('/coin-sellers/exchange',       cs.exchange);
router.get('/coin-sellers/exchange-requests', cs.getMyExchangeRequests);
router.get('/coin-sellers/transactions',  cs.getTransactions);
router.get('/coin-sellers/customers',     cs.getCustomers);
router.get('/coin-sellers/quick-message', cs.getQuickMessage);
router.put('/coin-sellers/quick-message', cs.updateQuickMessage);
router.get('/coin-sellers/level-rules',           cs.getLevelRules);
router.get('/coin-sellers/recharge-packages',     cs.getRechargePackages);
router.get('/coin-sellers/recharge-info',         cs.getRechargePaymentInfo);
router.get('/coin-sellers/recharge-requests',     cs.getMyRechargeRequests);
router.post('/coin-sellers/recharge-request',     adminUpload.single('proof'), cs.submitRechargeRequest);

// ── Payment Method binding sub-routes ────────────────────────────────────────
router.use('/methods', paymentMethodsRouter);

export default router;
