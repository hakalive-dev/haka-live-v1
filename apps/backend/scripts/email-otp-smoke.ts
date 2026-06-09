/**
 * Email OTP smoke test — exercises the same Supabase flow the mobile app uses for
 * the password-change verification (signInWithOtp → verifyOtp). Use it to confirm
 * custom SMTP (Namecheap Private Email) and the OTP email template actually work,
 * without building the mobile app.
 *
 * Env:
 *   SUPABASE_URL                     (required) — your project URL
 *   SUPABASE_ANON_KEY                (preferred) — falls back to SUPABASE_SERVICE_ROLE_KEY
 *   OTP_TEST_EMAIL                   (required) — an inbox you can read (e.g. your Gmail)
 *
 * Usage:
 *   # 1) send a code to OTP_TEST_EMAIL (check that inbox)
 *   npm run otp:smoke -- send
 *
 *   # 2) verify the 6-digit code from the email; prints the access token on success
 *   npm run otp:smoke -- verify 123456
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.OTP_TEST_EMAIL;

function die(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!url) die('SUPABASE_URL is not set');
if (!key) die('Set SUPABASE_ANON_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY');
if (!email) die('OTP_TEST_EMAIL is not set — use an inbox you can actually read');

const [mode, code] = process.argv.slice(2);
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function send(): Promise<void> {
  console.log(`Requesting an email OTP for ${email} …`);
  const { error } = await supabase.auth.signInWithOtp({
    email: email!,
    // Mirror the app: never provision a new Supabase user from this flow.
    options: { shouldCreateUser: false },
  });
  if (error) die(`signInWithOtp failed: ${error.message}`);
  console.log('✓ Supabase accepted the request. Check the inbox for a 6-digit code.');
  console.log('  (No email? SMTP not saved, template missing {{ .Token }}, or shouldCreateUser blocked a non-existent user.)');
  console.log(`\nNext: npm run otp:smoke -- verify <code>`);
}

async function verify(otp: string): Promise<void> {
  console.log(`Verifying code ${otp} for ${email} …`);
  const { data, error } = await supabase.auth.verifyOtp({ email: email!, token: otp, type: 'email' });
  if (error) die(`verifyOtp failed: ${error.message}`);
  const token = data.session?.access_token;
  if (!token) die('Verified but no session/access_token returned');
  console.log('✓ OTP verified. Supabase access token (this is what the app sends to PATCH /auth/password):\n');
  console.log(token);
  console.log('\nTo finish an end-to-end backend test, call:');
  console.log(`  curl -X PATCH "$API/auth/password" -H "Authorization: Bearer <USER_JWT>" \\`);
  console.log(`    -H 'Content-Type: application/json' \\`);
  console.log(`    -d '{"newPassword":"<new-pass>","accessToken":"<token-above>"}'`);
}

(async () => {
  if (mode === 'send') await send();
  else if (mode === 'verify') {
    if (!code) die('Pass the code: npm run otp:smoke -- verify 123456');
    await verify(code);
  } else {
    die('Usage: npm run otp:smoke -- send   |   npm run otp:smoke -- verify <code>');
  }
})();
