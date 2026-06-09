import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { audioUpload } from '../../utils/upload';
import { listLibrary, uploadToLibrary, deleteFromLibrary } from './music.controller';

const router = Router();

router.use(authenticate);

router.get('/library', listLibrary);
router.post('/library', audioUpload.single('file'), uploadToLibrary);
router.delete('/library/:trackId', deleteFromLibrary);

export default router;
