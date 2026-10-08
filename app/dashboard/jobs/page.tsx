import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { JobsTable } from '@/app/dashboard/jobs/jobs-table';
import { QueryError } from '@/components/stat-card';
import { createClient } from '@/lib/supabase/server';
import type { Job } from '@/lib/types';
import { errorMessage, formatNumber } from '@/lib/utils';

export const metadata: Metadata = { title: 'Jobs' };
export const dynamic = 'force-dynamic';

/** Hard cap so a very large jobs table can never blow up the page payload. */
const JOB_FETCH_LIMIT = 1000;

export default async function JobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/dashboard/jobs');

  const [jobsResult, appliedResult] = await Promise.all([
    supabase
      .from('jobs')
      .select('*')
      .order('date_posted', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(JOB_FETCH_LIMIT),
    supabase.from('applications').select('job_id'),
  ]);

  if (jobsResult.error) {
    return (
      <div className="space-y-4">
        <Header count={0} />
        <QueryError message={errorMessage(jobsResult.error)} context="Could not load jobs" />
      </div>
    );
  }

  const jobs = (jobsResult.data ?? []) as Job[];
  const appliedJobIds = ((appliedResult.data ?? []) as Array<{ job_id: number | null }>)
    .map((row) => row.job_id)
    .filter((id): id is number => typeof id === 'number');

  return (
    <div className="space-y-5">
      <Header count={jobs.length} />
      <JobsTable jobs={jobs} appliedJobIds={appliedJobIds} userId={user.id} />
    </div>
  );
}

function Header({ count }: { count: number }) {
  return (
    <div>
      <h1 className="page-title">Jobs</h1>
      <p className="page-subtitle">
        {count >= JOB_FETCH_LIMIT
          ? `Showing the ${formatNumber(count)} most recent scraped roles.`
          : `${formatNumber(count)} scraped role${count === 1 ? '' : 's'} across all boards.`}{' '}
        Filter, then mark the ones you apply to.
      </p>
    </div>
  );
}
