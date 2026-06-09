import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './accounts.controller';
import * as deletionCtrl from './account-deletion.controller';

const router = Router();

// ── Public endpoints (no auth required) ───────────────────────────────────────

// Verify Supabase access token → return backend JWT pair + user (Google / Apple / Phone OTP)
router.post('/supabase', ctrl.loginWithSupabase);

// Rotate refresh token
router.post('/refresh', ctrl.refresh);

// Revoke refresh token (logout, no auth header needed — token is in body)
router.post('/logout', ctrl.logout);

// Dev-only: login without Firebase (creates test user, returns JWTs)
router.post('/dev-login', ctrl.devLogin);

// Haka ID + password (production; requires bcrypt password on user)
router.post('/login', ctrl.loginWithHakaId);

// Dev-only: login by Haka ID + password (seeded test users)
router.post('/dev-login-haka', ctrl.devLoginWithHakaId);

// ── Protected endpoints (Bearer token required) ────────────────────────────────

router.use(authenticate);

// Revoke ALL refresh tokens for the current user
router.post('/logout-all', ctrl.logoutAll);

// Get current user profile
router.get('/me', ctrl.getMe);

// Self-service account deletion (Google Play requirement) — anonymize-in-place
router.get('/me/deletion-eligibility', deletionCtrl.getDeletionEligibility);
router.delete('/me', deletionCtrl.deleteMe);

// Complete onboarding (one-time)
router.patch('/onboarding', ctrl.completeOnboarding);

// Update mutable profile fields
router.patch('/profile', ctrl.updateProfile);

// Set or change password
router.patch('/password', ctrl.changePassword);

// Bind a verified phone number to existing account (Supabase phone OTP → accessToken)
router.patch('/bind-phone', ctrl.bindPhone);

// Device management
router.get('/devices', ctrl.getDevices);
router.delete('/devices/:deviceId', ctrl.removeDevice);

export default router;
