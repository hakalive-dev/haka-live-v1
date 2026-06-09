import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './activity.controller';

const router = Router();

router.use(authenticate);

router.get('/',       ctrl.getMyActivity);
router.get('/income', ctrl.getMyIncome);
router.get('/chart',  ctrl.getChartData);

export default router;
