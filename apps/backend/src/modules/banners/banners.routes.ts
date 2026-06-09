import { Router } from 'express';
import * as ctrl from './banners.controller';

const router = Router();

router.get('/', ctrl.listPublicBanners);

export default router;
