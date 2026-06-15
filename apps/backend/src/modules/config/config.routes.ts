import { Router } from 'express';
import { configController } from './config.controller';

// Public (no auth): the forced-update gate must run before/independent of login.
const router = Router();

router.get('/', configController.get);

export default router;
