import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Supabase client — used for auth only (sessions not persisted; the app uses its own JWT).
// Null when env vars are missing so the app still boots without Supabase configured.
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
