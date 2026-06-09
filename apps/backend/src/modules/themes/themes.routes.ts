import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { ok } from '../../utils/response';
import { getAvailableThemes } from './themes.service';

const router = Router();

router.get('/available', authenticate, async (req, res, next) => {
  try {
    ok(res, await getAvailableThemes(req.user!.id));
  } catch (err) { next(err); }
});

export default router;
