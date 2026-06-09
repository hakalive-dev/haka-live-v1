import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './admin-risk-control.controller';

const router = Router();

router.get('/stats',            requirePermission('risk.view'),   ctrl.getRiskStats);
router.get('/game-gifts',       requirePermission('risk.view'),   ctrl.listGameGiftRecords);
router.get('/',                 requirePermission('risk.view'),   ctrl.listRisks);
router.get('/:userId',          requirePermission('risk.view'),   ctrl.getUserRisk);
router.post('/:userId',         requirePermission('risk.manage'), ctrl.applyRisk);
router.patch('/:userId',        requirePermission('risk.manage'), ctrl.updateRisk);
router.delete('/:userId',       requirePermission('risk.manage'), ctrl.releaseRisk);

export default router;
