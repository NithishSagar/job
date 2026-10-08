import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ApplicationsTable } from '@/app/dashboard/applications/applications-table';
import { QueryError } from '@/components/stat-card';
import { createClient } from '@/lib/supabase/server';
import type { Application, JobOption } from '@/lib/types';
import { errorMessage, formatNumber } from '@/lib/utils';

export const metadata: Metadata = { title: 'Applications' };
export const dynamic = 'force-dynamic';

export default async function ApplicationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/dashboard/applications');

  const [applicationsResult, jobsResult] = await Promise.all([
    supabase
      .from('applications')
      .select('*')
      .order('date_applied', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false }),
    supabase
      .from('jobs')
      .select('id, company_name, job_title, source')
      .order('date_posted', { ascending: false, nullsFirst: false })
      .limit(1000),
  ]);

  if (applicationsResult.error) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="page-title">Applications</h1>
        </div>
        <QueryError
          message={errorMessage(applicationsResult.error)}
          context="Could not load applications"
        />
      </div>
    );
  }

  const applications = (applicationsResult.data ?? []) as Application[];
  const jobOptions = (jobsResult.data ?? []) as JobOption[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Applications</h1>
        <p className="page-subtitle">
          {formatNumber(applications.length)} tracked application
          {applications.length === 1 ? '' : 's'}. Status, dates and notes are editable inline — edits
          save straight to Supabase.
        </p>
      </div>

      <ApplicationsTable
        applications={applications}
        jobOptions={jobOptions}
        userId={user.id}
        jobsError={jobsResult.error ? errorMessage(jobsResult.error) : null}
      />
    </div>
  );
}
