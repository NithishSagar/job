'use client';

import { useState } from 'react';

import { TrashIcon } from '@/components/icons';
import { errorMessage } from '@/lib/utils';

/**
 * Account deletion is deliberately NOT performed from the browser: it needs the
 * Supabase service-role key (auth.admin.deleteUser), which must never reach
 * client code. This posts to /api/account/delete, which is a stub the owner has
 * to implement and secure server-side.
 */
export function DangerZone({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = confirmText.trim() === 'DELETE';

  async function handleDelete() {
    if (!canSubmit) return;
    const confirmed = window.confirm(
      `Last check: permanently delete the account ${email} and all of its jobs and applications?`,
    );
    if (!confirmed) return;

    setPending(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? body.message ?? `Request failed (${response.status})`);
        return;
      }
      setResult(body.message ?? 'Request accepted.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card card-pad border-rose-300 dark:border-rose-500/40">
      <h2 className="section-title text-rose-600 dark:text-rose-400">Danger zone</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Deleting your account removes the <code className="font-mono">auth.users</code> row, and the{' '}
        <code className="font-mono">ON DELETE CASCADE</code> foreign keys then remove every job,
        application, board row and invite that belongs to you. This cannot be undone.
      </p>

      {!open ? (
        <button type="button" className="btn btn-danger mt-3" onClick={() => setOpen(true)}>
          <TrashIcon className="h-4 w-4" />
          Delete account…
        </button>
      ) : (
        <div className="mt-3 space-y-3 rounded-lg border border-rose-300 bg-rose-50 p-3 dark:border-rose-500/40 dark:bg-rose-500/10">
          <div>
            <label className="label" htmlFor="delete-confirm">
              Type <span className="font-mono font-semibold">DELETE</span> to enable the button
            </label>
            <input
              id="delete-confirm"
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              placeholder="DELETE"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-danger"
              disabled={!canSubmit || pending}
              onClick={handleDelete}
            >
              {pending ? 'Sending…' : 'Permanently delete my account'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setOpen(false);
                setConfirmText('');
                setError(null);
                setResult(null);
              }}
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-rose-800 dark:text-rose-200">
            This posts to <code className="font-mono">/api/account/delete</code>, which ships as a
            stub returning 501. Implement it server-side with the service-role key (and keep that
            key out of any <code className="font-mono">NEXT_PUBLIC_</code> variable) before relying
            on it.
          </p>

          {result ? (
            <p className="text-xs text-slate-700 dark:text-slate-200">{result}</p>
          ) : null}
          {error ? (
            <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{error}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
