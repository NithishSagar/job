import type { Metadata } from 'next';
import Link from 'next/link';

import { AcceptInvite } from '@/app/invite/[code]/accept-invite';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import type { Invite } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Accept invite' };
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: { code: string } }) {
  const code = params.code;

  if (!isSupabaseConfigured) {
    return (
      <Shell title="Supabase is not configured">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This deployment is missing its Supabase environment variables, so invites cannot be
          checked.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('invite_code', code)
    .maybeSingle();

  const invite = (data ?? null) as Invite | null;

  if (error) {
    return (
      <Shell title="Could not check this invite">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Supabase returned an error: <span className="font-mono text-xs">{error.message}</span>
        </p>
      </Shell>
    );
  }

  if (!invite) {
    return (
      <Shell title="Invite not available">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          No usable invite was found for this link. That usually means one of:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>the code is wrong or was revoked;</li>
          <li>it has already been accepted (accepted invites are hidden by RLS);</li>
          <li>it expired — invites are valid for 7 days.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Ask the owner to generate a fresh invite from their Settings page.
        </p>
        <Link href="/login" className="link mt-4 inline-block text-sm">
          Go to sign in
        </Link>
      </Shell>
    );
  }

  const expired = invite.expires_at ? new Date(invite.expires_at).getTime() < Date.now() : false;

  if (invite.accepted) {
    return (
      <Shell title="Invite already accepted">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This invite was accepted on {formatDateTime(invite.accepted_at)}.
        </p>
        <Link href="/dashboard/jobs" className="btn btn-primary mt-4">
          Open the dashboard
        </Link>
      </Shell>
    );
  }

  if (expired) {
    return (
      <Shell title="Invite expired">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This invite expired on {formatDateTime(invite.expires_at)}. Ask the owner to generate a new
          one.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="You've been invited">
      <dl className="mt-1 space-y-2 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Invited email</dt>
          <dd className="font-medium text-slate-900 dark:text-white">{invite.invite_email}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Access level</dt>
          <dd>
            <span className="badge badge-indigo">{invite.role ?? 'viewer'}</span>
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-slate-500 dark:text-slate-400">Expires</dt>
          <dd className="text-slate-700 dark:text-slate-200">
            {formatDateTime(invite.expires_at)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
        Accepting links <em>your</em> account to the owner&apos;s data with read-only access to their
        jobs, applications and job-board tables.
      </p>

      {user ? (
        <AcceptInvite code={code} userEmail={user.email ?? ''} inviteEmail={invite.invite_email} />
      ) : (
        <div className="mt-4 space-y-3">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            You need an account first. Sign up (or sign in) with{' '}
            <strong>{invite.invite_email}</strong>, and you&apos;ll come straight back here to
            accept.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/invite/${code}`)}`}
            className="btn btn-primary"
          >
            Sign in or sign up
          </Link>
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 px-4 py-10 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/40">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-lg shadow-indigo-600/20">
            JH
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          <p className="page-subtitle">JobHunt Command Center</p>
        </div>
        <div className="card card-pad">{children}</div>
      </div>
    </main>
  );
}
