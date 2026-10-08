'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CopyIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import type { Invite } from '@/lib/types';
import { cn, errorMessage, formatDateTime, generateInviteCode } from '@/lib/utils';

export function InviteManager({
  ownerId,
  initialInvites,
}: {
  ownerId: string;
  initialInvites: Invite[];
}) {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  // Read the origin after mount so server and client markup match.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  function inviteLink(code: string) {
    return `${origin}/invite/${code}`;
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const supabase = createClient();
      const code = generateInviteCode();

      const { data, error: insertError } = await supabase
        .from('invites')
        .insert({
          owner_id: ownerId,
          invite_email: email.trim(),
          invite_code: code,
          role: 'viewer',
        })
        .select('*')
        .single();

      if (insertError) throw insertError;

      setInvites((current) => [data as Invite, ...current]);
      setEmail('');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function handleCopy(code: string) {
    const link = inviteLink(code);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 1800);
    } catch {
      window.prompt('Copy this invite link:', link);
    }
  }

  async function handleRevoke(invite: Invite) {
    const confirmed = window.confirm(
      `Revoke the invite for ${invite.invite_email}? ${
        invite.accepted
          ? 'They already accepted it, so deleting the row removes their viewer access.'
          : 'The link will stop working.'
      }`,
    );
    if (!confirmed) return;

    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from('invites').delete().eq('id', invite.id);
      if (deleteError) throw deleteError;
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function inviteState(invite: Invite) {
    if (invite.accepted) return { label: 'Accepted', className: 'badge-green' };
    const expiresAt = invite.expires_at ? new Date(invite.expires_at).getTime() : null;
    if (expiresAt !== null && expiresAt < Date.now())
      return { label: 'Expired', className: 'badge-red' };
    return { label: 'Pending', className: 'badge-yellow' };
  }

  return (
    <section className="card card-pad">
      <h2 className="section-title">Invite Claude (viewer access)</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Creates a <code className="font-mono">viewer</code> invite. A viewer can read your jobs,
        applications and board tables — they cannot write anything.
      </p>

      <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="invite-email">
            Invite email
          </label>
          <input
            id="invite-email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="claude@example.com"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          <PlusIcon className="h-4 w-4" />
          {pending ? 'Working…' : 'Generate invite'}
        </button>
      </form>

      <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        <strong>Nothing is emailed.</strong> Generating an invite only writes a row to{' '}
        <code className="font-mono">invites</code>. Copy the link below and send it yourself — the
        recipient must open it, sign up or log in with their own account, and press Accept before
        they get viewer access. Links expire 7 days after creation.
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {error}
        </p>
      ) : null}

      {invites.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {invites.map((invite) => {
            const state = inviteState(invite);
            return (
              <li
                key={invite.id}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {invite.invite_email}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {invite.role ?? 'viewer'} · created {formatDateTime(invite.created_at)} ·
                      expires {formatDateTime(invite.expires_at)}
                      {invite.accepted ? ` · accepted ${formatDateTime(invite.accepted_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('badge', state.className)}>{state.label}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-rose-600 dark:text-rose-400"
                      onClick={() => handleRevoke(invite)}
                      aria-label={`Revoke invite for ${invite.invite_email}`}
                      title="Revoke invite"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    readOnly
                    aria-label={`Invite link for ${invite.invite_email}`}
                    value={origin ? inviteLink(invite.invite_code) : `/invite/${invite.invite_code}`}
                    onFocus={(e) => e.currentTarget.select()}
                    className="input input-sm flex-1 font-mono"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(invite.invite_code)}
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                    {copiedCode === invite.invite_code ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No invites yet.</p>
      )}
    </section>
  );
}
