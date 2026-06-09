import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './notifications.controller';

const router = Router();

router.use(authenticate);

router.get('/',             ctrl.getNotifications);
router.get('/count',        ctrl.getUnreadCount);
router.patch('/read-all',   ctrl.markAllRead);
router.patch('/:id/read',   ctrl.markRead);
router.post('/fcm-token',   ctrl.updateFcmToken);

export default router;
