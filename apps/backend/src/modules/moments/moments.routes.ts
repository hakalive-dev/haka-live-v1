import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { momentController } from './moments.controller';

const router = Router();

router.use(authenticate);

router.get('/',               momentController.list);
router.post('/',              momentController.create);
router.get('/user/:userId',   momentController.listByUser);
router.get('/:id',            momentController.get);
router.delete('/:id',         momentController.remove);
router.post('/:id/like',      momentController.toggleLike);
router.get('/:id/comments',   momentController.getComments);
router.post('/:id/comments',  momentController.postComment);
router.post('/:id/share',     momentController.share);
router.post('/:id/gift',      momentController.sendGift);

export default router;
