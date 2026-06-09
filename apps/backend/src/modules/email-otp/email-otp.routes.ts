import { Router } from 'express';
import * as ctrl from './email-otp.controller';

const router = Router();

// ── Public (no auth) — email-login OTP ────────────────────────────────────────
// Send an email OTP to an address.
router.post('/email-otp/send', ctrl.send);

// Verify the OTP → find-or-match user by email → return backend JWT pair + user.
router.post('/email-otp/verify', ctrl.verify);

export default router;
