'use client';

import { useState } from 'react';

import { DownloadIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/utils';

export function ExportDataButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleExport() {
    setPending(true);
    setError(null);
    setDone(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [jobs, applications, boardStatus, boardStats, invites] = await Promise.all([
        supabase.from('jobs').select('*'),
        supabase.from('applications').select('*'),
        supabase.from('job_board_status').select('*'),
        supabase.from('job_board_stats').select('*'),
        supabase.from('invites').select('*'),
      ]);

      const firstError =
        jobs.error ?? applications.error ?? boardStatus.error ?? boardStats.error ?? null;
      if (firstError) throw firstError;

      const payload = {
        exported_at: new Date().toISOString(),
        exported_by: user?.email ?? null,
        user_id: user?.id ?? null,
        counts: {
          jobs: jobs.data?.length ?? 0,
          applications: applications.data?.length ?? 0,
          job_board_status: boardStatus.data?.length ?? 0,
          job_board_stats: boardStats.data?.length ?? 0,
          invites: invites.data?.length ?? 0,
        },
        jobs: jobs.data ?? [],
        applications: applications.data ?? [],
        job_board_status: boardStatus.data ?? [],
        job_board_stats: boardStats.data ?? [],
        invites: invites.data ?? [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `jobhunt-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setDone(
        `Exported ${payload.counts.jobs} jobs and ${payload.counts.applications} applications.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={pending}>
        <DownloadIcon className="h-4 w-4" />
        {pending ? 'Preparing…' : 'Download JSON export'}
      </button>

      {done ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{done}</p>
      ) : null}
      {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
