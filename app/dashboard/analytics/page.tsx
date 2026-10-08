import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AnalyticsCharts } from '@/app/dashboard/analytics/analytics-charts';
import { QueryError, StatCard } from '@/components/stat-card';
import { APPLICATION_STATUSES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { Application } from '@/lib/types';
import {
  errorMessage,
  formatNumber,
  formatRatio,
  shortDateLabel,
  startOfWeek,
} from '@/lib/utils';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

const WEEKS_SHOWN = 12;

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/dashboard/analytics');

  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, status, date_applied, date_of_response, interview_date, offer_status, company_name',
    );

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Analytics</h1>
        <QueryError message={errorMessage(error)} context="Could not load applications" />
      </div>
    );
  }

  const applications = (data ?? []) as Array<
    Pick<
      Application,
      | 'id'
      | 'status'
      | 'date_applied'
      | 'date_of_response'
      | 'interview_date'
      | 'offer_status'
      | 'company_name'
    >
  >;

  const total = applications.length;

  const interviews = applications.filter(
    (app) => app.status === 'Interview' || app.interview_date !== null,
  ).length;

  const offers = applications.filter(
    (app) => app.status === 'Offer' || (app.offer_status ?? '') !== '',
  ).length;

  const rejections = applications.filter((app) => app.status === 'Rejected').length;

  const responded = applications.filter(
    (app) =>
      app.date_of_response !== null ||
      (app.status !== 'Applied' && app.status !== 'Withdrawn') ||
      app.interview_date !== null,
  ).length;

  const rejectionRate = total > 0 ? rejections / total : null;
  const responseRate = total > 0 ? responded / total : null;
  const interviewRate = total > 0 ? interviews / total : null;

  // Average days from applying to first response.
  const responseDurations = applications
    .filter((app) => app.date_applied && app.date_of_response)
    .map((app) => {
      const applied = new Date(app.date_applied as string).getTime();
      const responseAt = new Date(app.date_of_response as string).getTime();
      return (responseAt - applied) / 86_400_000;
    })
    .filter((days) => Number.isFinite(days) && days >= 0);

  const avgResponseDays =
    responseDurations.length > 0
      ? responseDurations.reduce((sum, days) => sum + days, 0) / responseDurations.length
      : null;

  // ---- applications per week (last 12 weeks, including empty weeks) ----
  const now = new Date();
  const currentWeekStart = startOfWeek(now);
  const weekBuckets: Array<{ week: string; weekStart: number; applications: number }> = [];

  for (let i = WEEKS_SHOWN - 1; i >= 0; i -= 1) {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - i * 7);
    weekBuckets.push({ week: shortDateLabel(start), weekStart: start.getTime(), applications: 0 });
  }

  applications.forEach((app) => {
    if (!app.date_applied) return;
    const appliedAt = new Date(app.date_applied);
    if (Number.isNaN(appliedAt.getTime())) return;
    const bucketStart = startOfWeek(appliedAt).getTime();
    const bucket = weekBuckets.find((item) => item.weekStart === bucketStart);
    if (bucket) bucket.applications += 1;
  });

  const weeklyTrend = weekBuckets.map(({ week, applications: count }) => ({
    week,
    applications: count,
  }));

  // ---- status breakdown ----
  const statusCounts = APPLICATION_STATUSES.map((status) => ({
    status,
    count: applications.filter((app) => app.status === status).length,
  }));

  const otherStatuses = applications.filter(
    (app) => !APPLICATION_STATUSES.includes(app.status as (typeof APPLICATION_STATUSES)[number]),
  ).length;

  const statusBreakdown = [
    ...statusCounts,
    ...(otherStatuses > 0 ? [{ status: 'Other', count: otherStatuses }] : []),
  ].filter((item) => item.count > 0);

  const funnel = [
    { stage: 'Applied', count: total },
    { stage: 'Responded', count: responded },
    { stage: 'Interview', count: interviews },
    { stage: 'Offer', count: offers },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Analytics</h1>
        <p className="page-subtitle">
          Everything below is computed live from your <code className="font-mono">applications</code>{' '}
          rows.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total applications" value={formatNumber(total)} tone="indigo" />
        <StatCard
          label="Interviews"
          value={formatNumber(interviews)}
          hint={interviewRate !== null ? `${formatRatio(interviewRate)} of applications` : undefined}
          tone="default"
        />
        <StatCard label="Offers" value={formatNumber(offers)} tone="green" />
        <StatCard
          label="Rejection rate"
          value={rejectionRate === null ? '—' : formatRatio(rejectionRate)}
          hint={`${formatNumber(rejections)} rejected`}
          tone="rose"
        />
        <StatCard
          label="Response rate"
          value={responseRate === null ? '—' : formatRatio(responseRate)}
          hint={
            avgResponseDays !== null
              ? `Avg ${avgResponseDays.toFixed(1)} days to respond`
              : `${formatNumber(responded)} responded`
          }
          tone="amber"
        />
      </div>

      <AnalyticsCharts
        weeklyTrend={weeklyTrend}
        statusBreakdown={statusBreakdown}
        funnel={funnel}
        hasData={total > 0}
      />
    </div>
  );
}
