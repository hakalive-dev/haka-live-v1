import { Router } from 'express';
import { credentialLimiter } from '../../middleware/rate-limit.middleware';
import * as ctrl from './email-otp.controller';

const router = Router();

// ── Public (no auth) — email-login OTP ────────────────────────────────────────
// Send an email OTP to an address.
router.post('/email-otp/send', credentialLimiter, ctrl.send);

// Verify the OTP → find-or-match user by email → return backend JWT pair + user.
router.post('/email-otp/verify', credentialLimiter, ctrl.verify);

export default router;
