import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { RankedJobsView } from '@/app/dashboard/ranked/ranked-jobs-view';
import { QueryError } from '@/components/stat-card';
import { createClient } from '@/lib/supabase/server';
import type { RankedJob } from '@/lib/types';
import { errorMessage } from '@/lib/utils';

export const metadata: Metadata = { title: 'Ranked' };
export const dynamic = 'force-dynamic';

export default async function RankedJobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/dashboard/ranked');

  const [rankedResult, appliedResult] = await Promise.all([
    supabase
      .from('top_100_jobs')
      .select('*')
      .order('ranked_position', { ascending: true, nullsFirst: false })
      .limit(100),
    supabase.from('applications').select('job_id'),
  ]);

  if (rankedResult.error) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="page-title">Ranked</h1>
          <p className="page-subtitle">AI-scored matches from your evaluation pipeline.</p>
        </div>
        <QueryError
          message={errorMessage(rankedResult.error)}
          context="Could not load top_100_jobs"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This page reads the <code className="font-mono">top_100_jobs</code> view, which is
          created and populated by a separate evaluation process, not by this app. If it&apos;s
          missing, that process (or its migration) hasn&apos;t run yet.
        </p>
      </div>
    );
  }

  const jobs = (rankedResult.data ?? []) as RankedJob[];
  const appliedJobIds = ((appliedResult.data ?? []) as Array<{ job_id: number | null }>)
    .map((row) => row.job_id)
    .filter((id): id is number => typeof id === 'number');

  return <RankedJobsView jobs={jobs} appliedJobIds={appliedJobIds} userId={user.id} />;
}
