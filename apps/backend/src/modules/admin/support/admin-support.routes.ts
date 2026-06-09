import { Router } from 'express';
import * as ctrl from './admin-support.controller';

const router = Router();

router.get('/tickets',                    ctrl.listTickets);
router.get('/tickets/:id/screenshot/:index', ctrl.getScreenshot);
router.post('/tickets/:id/reply',         ctrl.replyTicket);
router.post('/tickets/:id/close',       ctrl.closeTicket);

export default router;
