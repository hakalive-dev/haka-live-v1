import { Router } from 'express';
import { requirePermission } from '../../../middleware/admin-auth.middleware';
import * as ctrl from './admin-events.controller';

const router = Router();

router.get('/',         requirePermission('event.view'),   ctrl.listEvents);
router.get('/:id',      requirePermission('event.view'),   ctrl.getEvent);
router.post('/',        requirePermission('event.manage'), ctrl.uploadEventBanner, ctrl.createEvent);
router.patch('/:id',    requirePermission('event.manage'), ctrl.uploadEventBanner, ctrl.updateEvent);
router.delete('/:id',   requirePermission('event.manage'), ctrl.deleteEvent);

export default router;
