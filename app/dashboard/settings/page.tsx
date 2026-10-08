import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DangerZone } from '@/app/dashboard/settings/danger-zone';
import { ExportDataButton } from '@/app/dashboard/settings/export-data-button';
import { InviteManager } from '@/app/dashboard/settings/invite-manager';
import { createClient } from '@/lib/supabase/server';
import type { Invite, UserProfile } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/dashboard/settings');

  const [{ data: profileData }, { data: invitesData }] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('invites')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const profile = (profileData ?? null) as UserProfile | null;
  const invites = (invitesData ?? []) as Invite[];

  const fullName =
    profile?.full_name ??
    (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Account, access sharing, data export.</p>
      </div>

      {/* ---------------- account ---------------- */}
      <section className="card card-pad">
        <h2 className="section-title">Account</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Email</dt>
            <dd className="mt-0.5 break-words text-sm font-medium text-slate-900 dark:text-white">
              {profile?.email ?? user.email ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Name</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
              {fullName ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Role</dt>
            <dd className="mt-0.5">
              <span className="badge badge-indigo">{profile?.role ?? 'owner'}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Account created</dt>
            <dd className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
              {formatDateTime(profile?.created_at ?? user.created_at)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500 dark:text-slate-400">User ID</dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-slate-600 dark:text-slate-300">
              {user.id}
            </dd>
          </div>
        </dl>
        {profile === null ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            No row found in <code className="font-mono">public.users</code> for this account. It is
            normally created by the <code className="font-mono">on_auth_user_created</code> trigger
            in <code className="font-mono">supabase/schema.sql</code> — if you signed up before
            applying the schema, insert the row once from the SQL editor.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Name and role are read-only here: the schema&apos;s RLS policies grant SELECT on{' '}
          <code className="font-mono">users</code> but no UPDATE.
        </p>
      </section>

      {/* ---------------- invites ---------------- */}
      <InviteManager ownerId={user.id} initialInvites={invites} />

      {/* ---------------- export ---------------- */}
      <section className="card card-pad">
        <h2 className="section-title">Export your data</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Downloads every row you can read from <code className="font-mono">jobs</code> and{' '}
          <code className="font-mono">applications</code> (plus board status and statistics) as a
          single JSON file.
        </p>
        <div className="mt-3">
          <ExportDataButton />
        </div>
      </section>

      {/* ---------------- danger zone ---------------- */}
      <DangerZone email={profile?.email ?? user.email ?? ''} />
    </div>
  );
}
