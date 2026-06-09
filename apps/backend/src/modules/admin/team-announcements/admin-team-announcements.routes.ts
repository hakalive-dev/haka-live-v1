import { Router } from 'express';
import { requireAdminRole } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './admin-team-announcements.controller';

const router = Router();

router.get('/', requireAdminRole('admin', 'super_admin'), ctrl.listAnnouncements);
router.post('/publish', requireAdminRole('admin', 'super_admin'), ctrl.publish);

export default router;
