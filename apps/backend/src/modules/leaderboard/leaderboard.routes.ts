import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './leaderboard.controller';
import { coinSellerController } from '../payments/coinSeller.controller';

const router = Router();

// All leaderboard routes require authentication
router.use(authenticate);

router.get('/rich/me',        ctrl.getMyRichRank);
router.get('/charm/me',       ctrl.getMyCharmRank);
router.get('/earners/me',     ctrl.getMyEarnerRank);
router.get('/earners/me/regional', ctrl.getMyRegionalEarnerRank);
router.get('/gifters/me',     ctrl.getMyGifterRank);
router.get('/lucky/me',       ctrl.getMyLuckyWinnerRank);
router.get('/creator/me',     ctrl.getMyCreatorStats);
router.get('/rich',           ctrl.getRichLeaderboard);
router.get('/charm',          ctrl.getCharmLeaderboard);
router.get('/gifters',        ctrl.getGiftersLeaderboard);
router.get('/lucky',          ctrl.getLuckyWinnersLeaderboard);
router.get('/earners',        ctrl.getEarnersLeaderboard);
router.get('/agency',         ctrl.getAgencyLeaderboard);
router.get('/creators',       ctrl.getCreatorsLeaderboard);
router.get('/room/:roomId',   ctrl.getRoomLeaderboard);
router.get('/fans/:userId',  ctrl.getTopFans);
router.get('/coin_sellers',   coinSellerController.getLeaderboard);

export default router;
