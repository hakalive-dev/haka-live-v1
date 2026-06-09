/**
 * Maps Firebase Auth errors from signInWithPhoneNumber() to user-facing copy.
 * Common: auth/billing-not-enabled when the GCP/Firebase project has no billing account.
 */

export type FirebasePhoneSmsContext = 'signIn' | 'linkPhone';

export function formatFirebasePhoneSmsError(
  e: unknown,
  context: FirebasePhoneSmsContext,
): string {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? '';
  const msg = err?.message ?? '';

  if (code === 'auth/billing-not-enabled' || /billing/i.test(msg)) {
    return context === 'signIn'
      ? 'SMS verification is unavailable because Firebase billing is not enabled for this app. Use Google Sign-in, or enable billing in Firebase Console (Blaze plan).'
      : 'Cannot send SMS: Firebase Phone Auth needs billing enabled on the Firebase project. In Google Cloud / Firebase Console, link a billing account (Blaze). Then retry binding your phone.';
  }
  if (code === 'auth/invalid-phone-number') {
    return 'Invalid phone number. Use full international format (e.g. +44…).';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Phone sign-in is not enabled for this Firebase project.';
  }
  return msg || 'Failed to send verification SMS.';
}
