import { Router } from 'express';
import { authenticate, optionalAuth } from '../../middleware/auth.middleware';
import * as ctrl from './users.controller';

const router = Router();

// ── Static/me routes first (must come before /:id to avoid conflicts) ─────────

// Search users (optional auth — isFollowing populated when logged in)
router.get('/search', optionalAuth, ctrl.searchUsers);

// Location-based discovery (optional auth — excludes self when logged in)
router.get('/nearby', optionalAuth, ctrl.getNearby);

// Authenticated-only "me" routes
router.get('/me/special-attention', authenticate, ctrl.getSpecialAttentionList);
router.get('/me/visitors',          authenticate, ctrl.getMyVisitors);

// ── Public profile (optional auth) ────────────────────────────────────────────
router.get('/:id', optionalAuth, ctrl.getProfile);

// ── Social graph (auth required) ──────────────────────────────────────────────
router.get('/:id/presence',   optionalAuth, ctrl.getPresence);
router.get('/:id/friends',    optionalAuth, ctrl.getFriends);
router.get('/:id/followers',  optionalAuth, ctrl.getFollowers);
router.get('/:id/following',  optionalAuth, ctrl.getFollowing);

router.post  ('/:id/follow',             authenticate, ctrl.followUser);
router.delete('/:id/follow',             authenticate, ctrl.unfollowUser);

router.post  ('/:id/special-attention',  authenticate, ctrl.addSpecialAttention);
router.delete('/:id/special-attention',  authenticate, ctrl.removeSpecialAttention);

router.post('/:id/visit', authenticate, ctrl.logVisit);

export default router;
