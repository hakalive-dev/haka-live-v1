import { Router } from 'express';
import * as ctrl from './admin-notifications.controller';

const router = Router();

router.get('/', ctrl.listNotifications);
router.get('/unread-count', ctrl.unreadCount);
router.patch('/:id/read', ctrl.markRead);
router.post('/read-all', ctrl.markAllRead);

export default router;
