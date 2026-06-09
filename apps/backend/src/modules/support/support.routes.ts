import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { chatImageUpload } from '../../utils/upload';
import * as ctrl from './support.controller';

const router = Router();

router.use(authenticate);

router.post('/tickets', ctrl.createTicket);
router.get('/tickets',  ctrl.getMyTickets);
router.post('/upload',  chatImageUpload.single('file'), ctrl.uploadScreenshot);

export default router;
