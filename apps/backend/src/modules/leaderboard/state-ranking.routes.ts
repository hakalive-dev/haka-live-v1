import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './state-ranking.controller';

const router = Router();

router.use(authenticate);

router.get('/rewards/config', ctrl.getRewardsConfig);
router.get('/can-inspect', ctrl.getCanInspect);

router.use(ctrl.requireStateRankingAccess);

router.get('/config', ctrl.getConfig);
router.get('/states', ctrl.getStates);
router.get('/states/summary', ctrl.getStatesSummary);
router.get('/states/:stateCode/hosts', ctrl.getStateHosts);
router.get('/me/state', ctrl.getMyState);
router.get('/me/host', ctrl.getMyHostRank);
router.get('/suggest-state', ctrl.getSuggestState);

export default router;
