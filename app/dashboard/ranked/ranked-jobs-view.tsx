'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { MatchScoreBadge, RecommendationBadge } from '@/components/badges';
import { CheckIcon, ExternalLinkIcon, PlusIcon, RefreshIcon, SearchIcon } from '@/components/icons';
import { EmptyState } from '@/components/stat-card';
import { RECOMMENDATIONS } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import type { RankedJob } from '@/lib/types';
import { cn, errorMessage, formatNumber, formatRelativeTime } from '@/lib/utils';

const AUTO_REFRESH_MS = 60_000;
const CLOCK_TICK_MS = 30_000;

type Tab = 'ALL' | (typeof RECOMMENDATIONS)[number];

export function RankedJobsView({
  jobs,
  appliedJobIds,
  userId,
}: {
  jobs: RankedJob[];
  appliedJobIds: number[];
  userId: string;
}) {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('ALL');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState<Set<number>>(() => new Set(appliedJobIds));
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(() => new Date());
  const [, setClockTick] = useState(0);

  // Timestamp when fresh data actually arrives (not merely when a refresh was
  // requested), so "Updated X ago" reflects reality even if a refresh is slow.
  useEffect(() => {
    setLastRefreshedAt(new Date());
  }, [jobs]);

  useEffect(() => {
    setApplied(new Set(appliedJobIds));
  }, [appliedJobIds]);

  // Keep the relative-time label ("2 minutes ago") honest between refreshes.
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((n) => n + 1), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // The scores themselves come from a separate evaluation process; this just
  // periodically asks the server component to re-fetch top_100_jobs so newly
  // written rows show up without a manual reload.
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  const counts = useMemo(() => {
    const result: Record<Tab, number> = { ALL: jobs.length, APPLY: 0, MAYBE: 0, SKIP: 0 };
    for (const job of jobs) {
      if (job.recommendation === 'APPLY') result.APPLY += 1;
      else if (job.recommendation === 'MAYBE') result.MAYBE += 1;
      else if (job.recommendation === 'SKIP') result.SKIP += 1;
    }
    return result;
  }, [jobs]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return jobs
      .filter((job) => (tab === 'ALL' ? true : job.recommendation === tab))
      .filter((job) => {
        if (!term) return true;
        return `${job.company_name} ${job.job_title}`.toLowerCase().includes(term);
      })
      .sort((a, b) => (a.ranked_position ?? 9999) - (b.ranked_position ?? 9999));
  }, [jobs, tab, search]);

  async function markAsApplied(job: RankedJob) {
    setPendingId(job.id);
    setRowError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('applications').insert({
        user_id: userId,
        job_id: job.id,
        company_name: job.company_name,
        job_title: job.job_title,
        status: 'Applied',
        date_applied: new Date().toISOString(),
      });
      if (error) throw error;

      setApplied((prev) => new Set(prev).add(job.id));
      router.refresh();
    } catch (err) {
      setRowError({ id: job.id, message: errorMessage(err) });
    } finally {
      setPendingId(null);
    }
  }

  function handleManualRefresh() {
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Ranked</h1>
          <p className="page-subtitle">
            {formatNumber(jobs.length)} job{jobs.length === 1 ? '' : 's'} ranked by the AI
            evaluation process. Updated {formatRelativeTime(lastRefreshedAt)}.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleManualRefresh}>
          <RefreshIcon className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Waiting for Claude to rank today's jobs…"
            description={`No rows in top_100_jobs yet. Last checked ${formatRelativeTime(lastRefreshedAt)} — this page re-checks automatically every minute.`}
            action={
              <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={handleManualRefresh}>
                <RefreshIcon className="h-4 w-4" />
                Check now
              </button>
            }
          />
        </div>
      ) : (
        <>
          {/* ---------------- tabs + search ---------------- */}
          <div className="card card-pad flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(['ALL', ...RECOMMENDATIONS] as Tab[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={cn(
                    'btn btn-sm',
                    tab === value ? 'btn-primary' : 'btn-secondary',
                  )}
                >
                  {value} ({formatNumber(counts[value])})
                </button>
              ))}
            </div>

            <div className="relative ml-auto w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-8"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company or title"
                aria-label="Search ranked jobs"
              />
            </div>
          </div>

          {/* ---------------- cards ---------------- */}
          {filtered.length === 0 ? (
            <div className="card">
              <EmptyState
                title="No jobs match this filter"
                description="Try a different tab, or clear the search box."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((job) => (
                <RankedJobCard
                  key={job.id}
                  job={job}
                  isApplied={applied.has(job.id)}
                  isPending={pendingId === job.id}
                  error={rowError?.id === job.id ? rowError.message : null}
                  onApply={() => markAsApplied(job)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RankedJobCard({
  job,
  isApplied,
  isPending,
  error,
  onApply,
}: {
  job: RankedJob;
  isApplied: boolean;
  isPending: boolean;
  error: string | null;
  onApply: () => void;
}) {
  return (
    <div className="card card-pad flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {job.ranked_position ? (
            <p className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              #{job.ranked_position} ranked
            </p>
          ) : null}
          <h3 className="mt-0.5 truncate text-base font-semibold text-slate-900 dark:text-white">
            {job.job_title}
          </h3>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{job.company_name}</p>
        </div>
        <MatchScoreBadge score={job.match_score} />
      </div>

      {job.location ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">📍 {job.location}</p>
      ) : null}

      <div>
        <RecommendationBadge value={job.recommendation} />
      </div>

      {job.fit_summary ? (
        <p className="line-clamp-3 text-sm text-slate-600 dark:text-slate-300">{job.fit_summary}</p>
      ) : null}

      {job.key_strengths_match && job.key_strengths_match.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Your match
          </p>
          <div className="flex flex-wrap gap-1.5">
            {job.key_strengths_match.slice(0, 5).map((skill) => (
              <span key={skill} className="badge badge-blue">
                {skill}
              </span>
            ))}
            {job.key_strengths_match.length > 5 ? (
              <span className="self-center text-xs text-slate-400 dark:text-slate-500">
                +{job.key_strengths_match.length - 5} more
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-2 pt-1">
        <a
          href={job.job_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm flex-1"
        >
          View & apply
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
        {isApplied ? (
          <span className="badge badge-green">
            <CheckIcon className="h-3.5 w-3.5" />
            Applied
          </span>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onApply} disabled={isPending}>
            {isPending ? 'Saving…' : <PlusIcon className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  );
}
