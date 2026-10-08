import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireSupabaseEnv } from '@/lib/supabase/env';

/**
 * Server Supabase client for Server Components, Server Actions and Route
 * Handlers. A fresh client is created per request — never cache or share it.
 *
 * Server Components cannot write cookies, so `setAll` swallows the error there;
 * `middleware.ts` is what actually refreshes the session cookies.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = cookies();
  const { url, anonKey } = requireSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — cookies are read-only there.
          // middleware.ts handles session refresh, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * The authenticated user for the current request, or null.
 * Uses `getUser()` (validates the JWT with Supabase) rather than trusting the
 * cookie contents.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
