import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { blocklistController } from './blocklist.controller';

const router = Router();

router.use(authenticate);

router.get('/',            blocklistController.list);
router.post('/',           blocklistController.block);
router.delete('/:userId',  blocklistController.unblock);

export default router;
