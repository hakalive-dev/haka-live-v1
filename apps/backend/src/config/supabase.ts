import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Service-role client — full storage access, only used server-side.
// Falls back to a no-op when Supabase env vars are not configured.
export const supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

/** Project ref from SUPABASE_URL (e.g. snewjtukygzebeeyjpwq) — for auth mismatch logs. */
export function configuredSupabaseProjectRef(): string | null {
  if (!env.SUPABASE_URL) return null;
  try {
    return new URL(env.SUPABASE_URL).hostname.split('.')[0] ?? null;
  } catch {
    return null;
  }
}

/** Decode `ref` claim from a Supabase user JWT without verifying (logging only). */
export function supabaseJwtProjectRef(accessToken: string): string | null {
  const part = accessToken.split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString()) as { ref?: string };
    return payload.ref ?? null;
  } catch {
    return null;
  }
}
