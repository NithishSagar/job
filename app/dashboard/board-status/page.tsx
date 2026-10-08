import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BoardStatusBadge, TrendIndicator, deriveTrend } from '@/components/badges';
import { RefreshButton } from '@/components/refresh-button';
import { QueryError, StatCard } from '@/components/stat-card';
import { JOB_BOARDS } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { JobBoardStatsRow, JobBoardStatusRow } from '@/lib/types';
import { errorMessage, formatDateTime, formatNumber, formatRelativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Board Status' };
export const dynamic = 'force-dynamic';

export default async function BoardStatusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/dashboard/board-status');

  const [statusResult, statsResult] = await Promise.all([
    supabase.from('job_board_status').select('*'),
    supabase.from('job_board_stats').select('*'),
  ]);

  if (statusResult.error) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Board Status</h1>
        <QueryError
          message={errorMessage(statusResult.error)}
          context="Could not load job_board_status"
        />
      </div>
    );
  }

  const statusRows = (statusResult.data ?? []) as JobBoardStatusRow[];
  const statsRows = (statsResult.data ?? []) as JobBoardStatsRow[];

  const statusByBoard = new Map(statusRows.map((row) => [row.board_name, row]));
  const statsByBoard = new Map(statsRows.map((row) => [row.board_name, row]));

  // Every configured board is rendered, plus any extra board the scraper
  // reported that isn't in the constant list yet.
  const extraBoards = [...statusByBoard.keys(), ...statsByBoard.keys()].filter(
    (name) => !JOB_BOARDS.includes(name as (typeof JOB_BOARDS)[number]),
  );
  const boardNames = [...JOB_BOARDS, ...Array.from(new Set(extraBoards)).sort()];

  const boards = boardNames.map((boardName) => {
    const status = statusByBoard.get(boardName) ?? null;
    const stats = statsByBoard.get(boardName) ?? null;
    const trend = deriveTrend(
      status?.jobs_scraped_today ?? stats?.jobs_today ?? null,
      stats?.jobs_this_week ?? null,
    );
    return { boardName, status, stats, trend };
  });

  const counts = {
    total: boards.length,
    working: boards.filter((b) => b.status?.status === 'Working').length,
    partial: boards.filter((b) => b.status?.status === 'Partial').length,
    down: boards.filter((b) => b.status?.status === 'Down').length,
  };
  const unknown = counts.total - counts.working - counts.partial - counts.down;

  const jobsToday = boards.reduce(
    (sum, board) => sum + (board.status?.jobs_scraped_today ?? board.stats?.jobs_today ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Board Status</h1>
          <p className="page-subtitle">
            Scraper health per job board. Boards with no row in{' '}
            <code className="font-mono">job_board_status</code> show as Unknown / not yet scraped.
          </p>
        </div>
        <RefreshButton />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total boards" value={counts.total} tone="indigo" />
        <StatCard label="✓ Working" value={counts.working} tone="green" />
        <StatCard label="⚠ Partial" value={counts.partial} tone="amber" />
        <StatCard label="✗ Down" value={counts.down} tone="rose" />
        <StatCard
          label="— Unknown / skipped"
          value={unknown}
          hint={`${formatNumber(jobsToday)} jobs scraped today`}
        />
      </div>

      {statsResult.error ? (
        <QueryError
          message={errorMessage(statsResult.error)}
          context="Jobs-this-week column unavailable (job_board_stats could not be read)"
        />
      ) : null}

      <div className="card overflow-hidden">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Board Name</th>
                <th>Status</th>
                <th>Last Scraped</th>
                <th className="text-right">Jobs Today</th>
                <th className="text-right">Jobs This Week</th>
                <th className="text-center">Trend</th>
                <th>Error Message</th>
              </tr>
            </thead>
            <tbody>
              {boards.map(({ boardName, status, stats, trend }) => {
                const today = status?.jobs_scraped_today ?? stats?.jobs_today ?? null;
                const thisWeek = stats?.jobs_this_week ?? null;
                return (
                  <tr key={boardName}>
                    <td className="nowrap font-medium text-slate-900 dark:text-white">
                      {boardName}
                      {status && (status.error_count ?? 0) > 0 ? (
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                          {formatNumber(status.error_count)} err /{' '}
                          {formatNumber(status.success_count ?? 0)} ok
                        </span>
                      ) : null}
                    </td>

                    <td>
                      <BoardStatusBadge status={status?.status ?? 'Unknown'} />
                    </td>

                    <td className="nowrap">
                      {status?.last_scraped ? (
                        <>
                          <span className="block text-slate-800 dark:text-slate-100">
                            {formatRelativeTime(status.last_scraped)}
                          </span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">
                            {formatDateTime(status.last_scraped)}
                          </span>
                        </>
                      ) : (
                        <span className="muted">Not yet scraped</span>
                      )}
                    </td>

                    <td className="text-right tabular-nums">
                      {today === null ? <span className="muted">—</span> : formatNumber(today)}
                    </td>

                    <td className="text-right tabular-nums">
                      {thisWeek === null ? <span className="muted">—</span> : formatNumber(thisWeek)}
                    </td>

                    <td className="text-center">
                      <TrendIndicator direction={trend.direction} detail={trend.detail} />
                    </td>

                    <td className="max-w-[22rem]">
                      {status?.error_message ? (
                        <span className="block break-words text-xs text-rose-600 dark:text-rose-400">
                          {status.error_message}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Trend compares today&apos;s scrape volume against the 7-day rolling average
        (jobs_this_week ÷ 7): ↑ more than 15% above, ↓ more than 15% below, → within range, — not
        enough data.
      </p>
    </div>
  );
}
