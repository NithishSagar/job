'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CheckIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/utils';

export function AcceptInvite({
  code,
  userEmail,
  inviteEmail,
}: {
  code: string;
  userEmail: string;
  inviteEmail: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch =
    userEmail.trim().toLowerCase() !== inviteEmail.trim().toLowerCase() && userEmail !== '';

  async function handleAccept() {
    setPending(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Your session expired. Sign in again and reopen this link.');

      // NOTE: no .select() here on purpose. The invitee's SELECT policy only
      // exposes invites where accepted = FALSE, so reading the row back after
      // flipping the flag would return nothing and look like a failure.
      // `count: 'exact'` still reports how many rows matched the UPDATE's USING
      // policy (evaluated against the row's state *before* the write), so it
      // distinguishes a real accept from a no-op against an already-accepted
      // or just-expired invite without tripping that same SELECT policy.
      const { error: updateError, count } = await supabase
        .from('invites')
        .update(
          {
            accepted: true,
            accepted_by_id: user.id,
            accepted_at: new Date().toISOString(),
          },
          { count: 'exact' },
        )
        .eq('invite_code', code)
        .eq('accepted', false);

      if (updateError) throw updateError;
      if (!count) {
        throw new Error(
          'This invite was just accepted or expired before your click landed. Ask the owner for a fresh one.',
        );
      }

      setAccepted(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (accepted) {
    return (
      <div className="mt-4 space-y-3">
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckIcon className="h-4 w-4" />
          Invite accepted. You now have viewer access.
        </p>
        <Link href="/dashboard/jobs" className="btn btn-primary">
          Open the dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Signed in as <span className="font-medium">{userEmail || 'unknown account'}</span>
      </p>

      {mismatch ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          Heads up: this invite was addressed to <strong>{inviteEmail}</strong>, but you&apos;re
          signed in as <strong>{userEmail}</strong>. You can still accept — the invite grants access
          to whichever account accepts it.
        </p>
      ) : null}

      <button type="button" className="btn btn-primary" onClick={handleAccept} disabled={pending}>
        {pending ? 'Accepting…' : 'Accept invite'}
      </button>

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
