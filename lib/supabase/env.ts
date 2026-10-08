/**
 * Resolves the public Supabase env vars.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so these literal
 * `process.env.X` references must stay as-is (no dynamic lookup) for the
 * browser bundle to receive them.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True when both public env vars are present (not necessarily valid). */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example). On Vercel these must ' +
        'be set before the build runs, because NEXT_PUBLIC_* values are inlined ' +
        'into the client bundle at build time.',
    );
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}
