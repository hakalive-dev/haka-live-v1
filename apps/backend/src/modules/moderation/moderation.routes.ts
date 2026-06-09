import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authenticateAdmin, requirePermission } from '../../middleware/admin-auth.middleware';
import * as ctrl from './moderation.controller';

const router = Router();

// User-facing
router.post('/report', authenticate, ctrl.submitReport);

// Admin-only: reports
router.get('/reports',       authenticateAdmin, requirePermission('report.view'),   ctrl.getReports);
router.patch('/reports/:id', authenticateAdmin, requirePermission('report.handle'), ctrl.reviewReport);

// Admin-only: user bans
router.post('/ban',           authenticateAdmin, requirePermission('user.ban'), ctrl.banUser);
router.delete('/ban/:userId', authenticateAdmin, requirePermission('user.ban'), ctrl.unbanUser);
router.get('/bans',           authenticateAdmin, requirePermission('user.ban'), ctrl.getBans);

// Admin-only: device bans
router.post('/device-ban',             authenticateAdmin, requirePermission('user.ban'), ctrl.banDevice);
router.delete('/device-ban/:deviceId', authenticateAdmin, requirePermission('user.ban'), ctrl.unbanDevice);
router.get('/device-bans',             authenticateAdmin, requirePermission('user.ban'), ctrl.getDeviceBans);

export default router;
