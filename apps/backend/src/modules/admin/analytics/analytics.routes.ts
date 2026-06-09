import { Router } from 'express';
import * as ctrl from './analytics.controller';

const router = Router();

router.get('/overview',     ctrl.getOverview);
router.get('/top-hosts',    ctrl.getTopHosts);
router.get('/top-senders',  ctrl.getTopSenders);
router.get('/user-growth',  ctrl.getUserGrowth);

export default router;
