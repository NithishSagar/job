'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireSupabaseEnv } from '@/lib/supabase/env';

let browserClient: SupabaseClient | undefined;

/**
 * Browser Supabase client (singleton).
 *
 * Session tokens are stored in cookies by @supabase/ssr so that Server
 * Components and middleware can read the same session.
 */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const { url, anonKey } = requireSupabaseEnv();
  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
