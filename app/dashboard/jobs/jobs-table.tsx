'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { RemoteBadge, VisaBadge } from '@/components/badges';
import { CheckIcon, ExternalLinkIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { EmptyState } from '@/components/stat-card';
import { createClient } from '@/lib/supabase/client';
import type { Job } from '@/lib/types';
import { cn, errorMessage, formatDate, formatNumber, formatSalaryRange } from '@/lib/utils';

type VisaFilter = 'any' | 'yes' | 'no' | 'unknown';
type SortKey = 'newest' | 'salary' | 'company';

const PAGE_SIZE = 50;

export function JobsTable({
  jobs,
  appliedJobIds,
  userId,
}: {
  jobs: Job[];
  appliedJobIds: number[];
  userId: string;
}) {
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [includeUnknownSalary, setIncludeUnknownSalary] = useState(true);
  const [visa, setVisa] = useState<VisaFilter>('any');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('all');
  const [remote, setRemote] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [applied, setApplied] = useState<Set<number>>(() => new Set(appliedJobIds));
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  const sources = useMemo(
    () => Array.from(new Set(jobs.map((job) => job.source).filter(Boolean))).sort(),
    [jobs],
  );
  const remoteOptions = useMemo(
    () =>
      Array.from(
        new Set(jobs.map((job) => job.remote_status).filter((v): v is string => Boolean(v))),
      ).sort(),
    [jobs],
  );
  const locationOptions = useMemo(
    () =>
      Array.from(
        new Set(jobs.map((job) => job.location).filter((v): v is string => Boolean(v))),
      ).sort(),
    [jobs],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const locTerm = location.trim().toLowerCase();
    const min = salaryMin.trim() === '' ? null : Number(salaryMin);
    const max = salaryMax.trim() === '' ? null : Number(salaryMax);

    const result = jobs.filter((job) => {
      if (term) {
        const haystack = `${job.company_name} ${job.job_title} ${(job.tags ?? []).join(' ')}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      if (locTerm) {
        if (!(job.location ?? '').toLowerCase().includes(locTerm)) return false;
      }

      if (source !== 'all' && job.source !== source) return false;
      if (remote !== 'all' && job.remote_status !== remote) return false;

      if (visa === 'yes' && job.visa_sponsorship !== true) return false;
      if (visa === 'no' && job.visa_sponsorship !== false) return false;
      if (visa === 'unknown' && job.visa_sponsorship !== null && job.visa_sponsorship !== undefined)
        return false;

      const hasSalary =
        (typeof job.salary_min === 'number' && job.salary_min > 0) ||
        (typeof job.salary_max === 'number' && job.salary_max > 0);

      if ((min !== null && Number.isFinite(min)) || (max !== null && Number.isFinite(max))) {
        if (!hasSalary) return includeUnknownSalary;

        // Overlap test between [jobMin, jobMax] and [min, max].
        const jobMin = job.salary_min ?? job.salary_max ?? 0;
        const jobMax = job.salary_max ?? job.salary_min ?? Number.MAX_SAFE_INTEGER;
        if (min !== null && Number.isFinite(min) && jobMax < min) return false;
        if (max !== null && Number.isFinite(max) && jobMin > max) return false;
      }

      return true;
    });

    const sorted = [...result];
    if (sort === 'salary') {
      sorted.sort((a, b) => (b.salary_max ?? b.salary_min ?? -1) - (a.salary_max ?? a.salary_min ?? -1));
    } else if (sort === 'company') {
      sorted.sort((a, b) => a.company_name.localeCompare(b.company_name));
    } else {
      sorted.sort((a, b) => {
        const at = a.date_posted ? new Date(a.date_posted).getTime() : 0;
        const bt = b.date_posted ? new Date(b.date_posted).getTime() : 0;
        if (bt !== at) return bt - at;
        return b.id - a.id;
      });
    }
    return sorted;
  }, [
    jobs,
    search,
    location,
    source,
    remote,
    visa,
    salaryMin,
    salaryMax,
    includeUnknownSalary,
    sort,
  ]);

  const visible = filtered.slice(0, visibleCount);

  function resetFilters() {
    setSearch('');
    setSalaryMin('');
    setSalaryMax('');
    setIncludeUnknownSalary(true);
    setVisa('any');
    setLocation('');
    setSource('all');
    setRemote('all');
    setSort('newest');
    setVisibleCount(PAGE_SIZE);
  }

  async function markAsApplied(job: Job) {
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

      setApplied((prev) => {
        const next = new Set(prev);
        next.add(job.id);
        return next;
      });
      router.refresh();
    } catch (err) {
      setRowError({ id: job.id, message: errorMessage(err) });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* ---------------- filters ---------------- */}
      <div className="card card-pad">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="label" htmlFor="job-search">
              Search company or title
            </label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="job-search"
                className="input pl-8"
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                placeholder="e.g. machine learning"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="job-location">
              Location
            </label>
            <input
              id="job-location"
              className="input"
              list="job-location-options"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="e.g. London"
            />
            <datalist id="job-location-options">
              {locationOptions.slice(0, 200).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="label" htmlFor="job-visa">
              Visa sponsorship
            </label>
            <select
              id="job-visa"
              className="select"
              value={visa}
              onChange={(e) => {
                setVisa(e.target.value as VisaFilter);
                setVisibleCount(PAGE_SIZE);
              }}
            >
              <option value="any">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="job-source">
              Source board
            </label>
            <select
              id="job-source"
              className="select"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
            >
              <option value="all">All boards</option>
              {sources.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="job-remote">
              Remote status
            </label>
            <select
              id="job-remote"
              className="select"
              value={remote}
              onChange={(e) => {
                setRemote(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
            >
              <option value="all">Any</option>
              {remoteOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="job-salary-min">
              Salary min
            </label>
            <input
              id="job-salary-min"
              className="input"
              type="number"
              min={0}
              step={1000}
              value={salaryMin}
              onChange={(e) => {
                setSalaryMin(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="50000"
            />
          </div>

          <div>
            <label className="label" htmlFor="job-salary-max">
              Salary max
            </label>
            <input
              id="job-salary-max"
              className="input"
              type="number"
              min={0}
              step={1000}
              value={salaryMax}
              onChange={(e) => {
                setSalaryMax(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="120000"
            />
          </div>

          <div>
            <label className="label" htmlFor="job-sort">
              Sort by
            </label>
            <select
              id="job-sort"
              className="select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="newest">Newest posted</option>
              <option value="salary">Highest salary</option>
              <option value="company">Company A–Z</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/40 dark:border-slate-600 dark:bg-slate-900"
              checked={includeUnknownSalary}
              onChange={(e) => setIncludeUnknownSalary(e.target.checked)}
            />
            Include roles with no salary listed when filtering by salary
          </label>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {formatNumber(filtered.length)} of {formatNumber(jobs.length)} roles
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters}>
              Reset filters
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- table ---------------- */}
      <div className="card overflow-hidden">
        {visible.length === 0 ? (
          <EmptyState
            title="No jobs match these filters"
            description={
              jobs.length === 0
                ? 'No scraped jobs yet. Once the scraper writes rows into the jobs table they will appear here.'
                : 'Try widening the salary range or clearing the visa / board filters.'
            }
            action={
              jobs.length > 0 ? (
                <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={resetFilters}>
                  Reset filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Salary</th>
                  <th>Location</th>
                  <th>Visa</th>
                  <th>Date Posted</th>
                  <th>Source</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((job) => {
                  const isApplied = applied.has(job.id);
                  const isPending = pendingId === job.id;
                  return (
                    <tr key={job.id}>
                      <td className="font-medium text-slate-900 dark:text-white">
                        <span className="flex items-center gap-1.5">
                          {job.company_name}
                          {job.is_tier1_company ? (
                            <span
                              className="badge badge-indigo"
                              title="Tier-1 company"
                              aria-label="Tier-1 company"
                            >
                              T1
                            </span>
                          ) : null}
                        </span>
                        {job.company_size || job.funding_stage ? (
                          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                            {[job.company_size, job.funding_stage].filter(Boolean).join(' · ')}
                          </span>
                        ) : null}
                      </td>

                      <td className="max-w-[18rem]">
                        {job.job_url ? (
                          <a
                            href={job.job_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link inline-flex items-start gap-1 font-medium"
                          >
                            <span className="line-clamp-2">{job.job_title}</span>
                            <ExternalLinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          </a>
                        ) : (
                          <span className="font-medium">{job.job_title}</span>
                        )}
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <RemoteBadge value={job.remote_status} />
                          {job.job_type ? <span className="badge badge-grey">{job.job_type}</span> : null}
                        </span>
                      </td>

                      <td className="nowrap tabular-nums">
                        {formatSalaryRange(job.salary_min, job.salary_max, job.salary_currency)}
                      </td>

                      <td className="max-w-[12rem]">{job.location || <span className="muted">—</span>}</td>

                      <td>
                        <VisaBadge value={job.visa_sponsorship} />
                      </td>

                      <td className="nowrap">{formatDate(job.date_posted)}</td>

                      <td className="nowrap">{job.source}</td>

                      <td className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          {isApplied ? (
                            <span className="badge badge-green">
                              <CheckIcon className="h-3.5 w-3.5" />
                              Applied
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={cn('btn btn-primary btn-sm')}
                              onClick={() => markAsApplied(job)}
                              disabled={isPending}
                            >
                              {isPending ? (
                                'Saving…'
                              ) : (
                                <>
                                  <PlusIcon className="h-3.5 w-3.5" />
                                  Mark as Applied
                                </>
                              )}
                            </button>
                          )}
                          {rowError?.id === job.id ? (
                            <span className="max-w-[14rem] text-right text-xs text-rose-600 dark:text-rose-400">
                              {rowError.message}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {visible.length < filtered.length ? (
          <div className="flex items-center justify-center border-t border-slate-200 p-3 dark:border-slate-800">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              Load {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
