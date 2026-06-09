import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import * as ctrl from './razorpay.controller';

const router = Router();

router.post('/create-order', authenticate, ctrl.createOrder);
router.post('/webhook', ctrl.webhook);

export default router;
