import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/auth.middleware';
import { hostsController } from './hosts.controller';

const router = Router();

router.get('/official-contact', hostsController.getOfficialContact);

router.use(authenticate);

router.get('/me/agency',       hostsController.getMyAgency);
router.get('/me/income',       hostsController.getIncome);
router.get('/me/tier',         hostsController.getMyTier);
router.get('/me/mic-progress', hostsController.getMicProgress);
router.post('/me/agency/leave',  hostsController.leaveAgency);
router.post('/me/agency/change', hostsController.changeAgency);

router.get('/level-task/rules', hostsController.getLevelTaskRules);
router.get('/me/level-task', requireRole('host', 'agent'), hostsController.getLevelTask);
router.post('/me/level-task/claim-live', requireRole('host', 'agent'), hostsController.claimLevelTaskLive);
router.post('/me/level-task/claim-income', requireRole('host', 'agent'), hostsController.claimLevelTaskIncome);

export default router;
