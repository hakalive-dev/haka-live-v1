import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { settingsController } from './settings.controller';

const router = Router();

router.use(authenticate);

router.get('/', settingsController.get);
router.patch('/', settingsController.update);

export default router;
