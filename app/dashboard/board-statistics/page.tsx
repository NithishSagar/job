import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BoardStatisticsCharts } from '@/app/dashboard/board-statistics/board-statistics-charts';
import { RefreshButton } from '@/components/refresh-button';
import { EmptyState, QueryError, StatCard } from '@/components/stat-card';
import { JOB_BOARDS } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { JobBoardStatsRow } from '@/lib/types';
import {
  errorMessage,
  formatNumber,
  formatPercent,
  formatSalaryRange,
  compactNumber,
} from '@/lib/utils';

export const metadata: Metadata = { title: 'Board Statistics' };
export const dynamic = 'force-dynamic';

export default async function BoardStatisticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/dashboard/board-statistics');

  const { data, error } = await supabase.from('job_board_stats').select('*');

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Board Statistics</h1>
        <QueryError message={errorMessage(error)} context="Could not load job_board_stats" />
      </div>
    );
  }

  const statsRows = (data ?? []) as JobBoardStatsRow[];
  const statsByBoard = new Map(statsRows.map((row) => [row.board_name, row]));

  const extraBoards = statsRows
    .map((row) => row.board_name)
    .filter((name) => !JOB_BOARDS.includes(name as (typeof JOB_BOARDS)[number]));

  const boardNames = [...JOB_BOARDS, ...Array.from(new Set(extraBoards)).sort()];

  const rows = boardNames
    .map((boardName) => ({ boardName, stats: statsByBoard.get(boardName) ?? null }))
    .sort((a, b) => (b.stats?.total_jobs_scraped ?? -1) - (a.stats?.total_jobs_scraped ?? -1));

  const totals = statsRows.reduce(
    (acc, row) => ({
      allTime: acc.allTime + (row.total_jobs_scraped ?? 0),
      month: acc.month + (row.jobs_this_month ?? 0),
      week: acc.week + (row.jobs_this_week ?? 0),
      today: acc.today + (row.jobs_today ?? 0),
    }),
    { allTime: 0, month: 0, week: 0, today: 0 },
  );

  const boardsWithData = statsRows.filter((row) => (row.total_jobs_scraped ?? 0) > 0);

  const salaryBoards = statsRows.filter(
    (row) => (row.avg_salary_min ?? 0) > 0 || (row.avg_salary_max ?? 0) > 0,
  );
  const avgSalaryMin =
    salaryBoards.length > 0
      ? Math.round(
          salaryBoards.reduce((sum, row) => sum + (row.avg_salary_min ?? 0), 0) /
            salaryBoards.length,
        )
      : null;
  const avgSalaryMax =
    salaryBoards.length > 0
      ? Math.round(
          salaryBoards.reduce((sum, row) => sum + (row.avg_salary_max ?? 0), 0) /
            salaryBoards.length,
        )
      : null;

  // ---- chart series ----
  const distribution = boardsWithData
    .map((row) => ({ board: row.board_name, value: row.total_jobs_scraped ?? 0 }))
    .sort((a, b) => b.value - a.value);

  const TOP_N = 8;
  const pieData =
    distribution.length > TOP_N
      ? [
          ...distribution.slice(0, TOP_N),
          {
            board: 'Other boards',
            value: distribution.slice(TOP_N).reduce((sum, item) => sum + item.value, 0),
          },
        ]
      : distribution;

  const weeklyData = statsRows
    .map((row) => ({ board: row.board_name, jobs: row.jobs_this_week ?? 0 }))
    .filter((item) => item.jobs > 0)
    .sort((a, b) => b.jobs - a.jobs);

  const snapshotData = statsRows
    .map((row) => ({
      board: row.board_name,
      today: row.jobs_today ?? 0,
      week: row.jobs_this_week ?? 0,
      month: row.jobs_this_month ?? 0,
    }))
    .filter((item) => item.today > 0 || item.week > 0 || item.month > 0)
    .sort((a, b) => b.month - a.month)
    .slice(0, 12);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Board Statistics</h1>
          <p className="page-subtitle">
            Per-board scrape volume, salary and conversion stats from{' '}
            <code className="font-mono">job_board_stats</code>.
          </p>
        </div>
        <RefreshButton />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Jobs all-time" value={formatNumber(totals.allTime)} tone="indigo" />
        <StatCard label="This month" value={formatNumber(totals.month)} />
        <StatCard label="This week" value={formatNumber(totals.week)} />
        <StatCard label="Today" value={formatNumber(totals.today)} tone="green" />
        <StatCard
          label="Avg salary (boards)"
          value={formatSalaryRange(avgSalaryMin, avgSalaryMax, 'GBP')}
          hint={`${boardsWithData.length} of ${boardNames.length} boards reporting`}
          tone="amber"
        />
      </div>

      <div className="card overflow-hidden">
        {statsRows.length === 0 ? (
          <EmptyState
            title="No board statistics yet"
            description="Once the scraper upserts rows into job_board_stats, every board's volume, salary and response-rate figures appear here."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Board</th>
                  <th className="text-right">All-Time</th>
                  <th className="text-right">This Month</th>
                  <th className="text-right">This Week</th>
                  <th className="text-right">Today</th>
                  <th className="text-right">% of Total</th>
                  <th className="text-right">Avg Salary</th>
                  <th className="text-right">Visa %</th>
                  <th className="text-right">Response Rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ boardName, stats }) => {
                  const allTime = stats?.total_jobs_scraped ?? null;
                  const share =
                    totals.allTime > 0 && allTime !== null ? (allTime / totals.allTime) * 100 : null;

                  return (
                    <tr key={boardName}>
                      <td className="nowrap font-medium text-slate-900 dark:text-white">
                        {boardName}
                        {stats === null ? (
                          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                            no data
                          </span>
                        ) : null}
                      </td>
                      <td className="text-right tabular-nums">
                        {allTime === null ? <span className="muted">—</span> : formatNumber(allTime)}
                      </td>
                      <td className="text-right tabular-nums">
                        {stats === null ? (
                          <span className="muted">—</span>
                        ) : (
                          formatNumber(stats.jobs_this_month ?? 0)
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {stats === null ? (
                          <span className="muted">—</span>
                        ) : (
                          formatNumber(stats.jobs_this_week ?? 0)
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {stats === null ? (
                          <span className="muted">—</span>
                        ) : (
                          formatNumber(stats.jobs_today ?? 0)
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {share === null ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-slate-200 sm:block dark:bg-slate-700"
                            >
                              <span
                                className="block h-full rounded-full bg-indigo-500"
                                style={{ width: `${Math.min(100, Math.max(2, share))}%` }}
                              />
                            </span>
                            {formatPercent(share)}
                          </span>
                        )}
                      </td>
                      <td className="nowrap text-right tabular-nums">
                        {stats === null
                          ? '—'
                          : formatSalaryRange(stats.avg_salary_min, stats.avg_salary_max, 'GBP')}
                      </td>
                      <td className="text-right tabular-nums">
                        {stats === null ? (
                          <span className="muted">—</span>
                        ) : (
                          formatPercent(stats.visa_sponsorship_percent)
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {stats === null ? (
                          <span className="muted">—</span>
                        ) : (
                          formatPercent(stats.response_rate)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold dark:bg-slate-800/50">
                  <td className="px-3 py-2.5 text-slate-900 dark:text-white">
                    Total ({statsRows.length} boards reporting)
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(totals.allTime)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(totals.month)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(totals.week)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(totals.today)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {totals.allTime > 0 ? '100.0%' : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {avgSalaryMin || avgSalaryMax
                      ? `£${compactNumber(avgSalaryMin ?? 0)}–£${compactNumber(avgSalaryMax ?? 0)}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">—</td>
                  <td className="px-3 py-2.5 text-right">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <BoardStatisticsCharts
        pieData={pieData}
        weeklyData={weeklyData}
        snapshotData={snapshotData}
      />

      <p className="text-xs text-slate-500 dark:text-slate-400">
        <strong>Visa %</strong> and <strong>Response Rate</strong> are rendered as stored — the
        scraper should write them as percentages (0–100), not ratios (0–1).{' '}
        <strong>Avg Salary</strong> formats <code className="font-mono">avg_salary_min</code>–
        <code className="font-mono">avg_salary_max</code> in GBP.
      </p>
    </div>
  );
}
