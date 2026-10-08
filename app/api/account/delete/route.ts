import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Account deletion — INTENTIONALLY STUBBED.
 *
 * Deleting a user requires the Supabase service-role key
 * (`supabase.auth.admin.deleteUser`), which bypasses RLS entirely and must
 * never be exposed to the browser or committed to the repo. This route
 * authenticates the caller and then refuses to act, so the UI can be wired up
 * end-to-end without shipping an irreversible destructive path by default.
 *
 * To implement it yourself:
 *
 *   1. Add SUPABASE_SERVICE_ROLE_KEY as a *server-only* env var (no
 *      NEXT_PUBLIC_ prefix) in Vercel.
 *   2. Replace the 501 below with something like:
 *
 *      import { createClient as createAdminClient } from '@supabase/supabase-js';
 *
 *      const admin = createAdminClient(
 *        process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *        process.env.SUPABASE_SERVICE_ROLE_KEY!,
 *        { auth: { autoRefreshToken: false, persistSession: false } },
 *      );
 *      const { error } = await admin.auth.admin.deleteUser(user.id);
 *
 *   3. Gate it properly: require a fresh re-authentication (ask for the
 *      password again and verify it with signInWithPassword), rate-limit the
 *      route, and log the deletion. The ON DELETE CASCADE foreign keys in
 *      schema.sql remove the user's jobs/applications/board rows/invites.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'Missing confirmation. Send { "confirm": "DELETE" }.' },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      error: 'Account deletion is not enabled on this deployment.',
      message:
        'This endpoint is a stub. Deleting an account needs the Supabase service-role key, ' +
        'so it must be implemented and secured server-side (see the comment in ' +
        'app/api/account/delete/route.ts). Until then, delete the user from the Supabase ' +
        'dashboard under Authentication -> Users.',
      user_id: user.id,
    },
    { status: 501 },
  );
}
