import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './whatsapp-otp.controller';

const router = Router();

// ── Public (no auth) — phone-login OTP ────────────────────────────────────────
// Send a WhatsApp OTP to a phone number.
router.post('/whatsapp/send', ctrl.send);

// Verify the OTP → find-or-create user by phone → return backend JWT pair + user.
router.post('/whatsapp/verify', ctrl.verify);

// ── Protected — bind a phone to the current account ───────────────────────────
router.patch('/whatsapp/bind', authenticate, ctrl.bind);

export default router;
