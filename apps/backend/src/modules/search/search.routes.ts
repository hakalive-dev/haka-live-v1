import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { searchController } from './search.controller';

const router = Router();

router.use(authenticate);

router.get('/', searchController.global);

export default router;
