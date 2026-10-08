'use client';

import { useEffect, useMemo, useState } from 'react';

import { CloseIcon } from '@/components/icons';
import { APPLICATION_STATUSES, INTERVIEW_TYPES, OFFER_STATUSES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import type { Application, JobOption } from '@/lib/types';
import { cn, emptyToNull, errorMessage, parseNumberOrNull, toDateInputValue } from '@/lib/utils';

type Mode = 'existing' | 'manual';

/**
 * `applications.job_id` is NOT NULL and references jobs(id), so a brand-new
 * application must be attached to a job row. Either pick an existing scraped
 * job, or enter one manually — in which case a `jobs` row with source
 * 'Manual' is upserted first (unique on user_id + job_url).
 */
export function NewApplicationDialog({
  userId,
  jobOptions,
  jobsError,
  onClose,
  onCreated,
}: {
  userId: string;
  jobOptions: JobOption[];
  jobsError: string | null;
  onClose: () => void;
  onCreated: (created: Application) => void;
}) {
  const [mode, setMode] = useState<Mode>(jobOptions.length > 0 ? 'existing' : 'manual');
  const [jobFilter, setJobFilter] = useState('');
  const [jobId, setJobId] = useState<string>('');

  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [location, setLocation] = useState('');

  const [status, setStatus] = useState<string>('Applied');
  const [dateApplied, setDateApplied] = useState(toDateInputValue(new Date()));
  const [coverLetter, setCoverLetter] = useState('');
  const [cvUsed, setCvUsed] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewType, setInterviewType] = useState('');
  const [offerStatus, setOfferStatus] = useState('');
  const [offerSalaryMin, setOfferSalaryMin] = useState('');
  const [offerSalaryMax, setOfferSalaryMax] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [notes, setNotes] = useState('');

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const filteredJobs = useMemo(() => {
    const term = jobFilter.trim().toLowerCase();
    const list = term
      ? jobOptions.filter((job) =>
          `${job.company_name} ${job.job_title}`.toLowerCase().includes(term),
        )
      : jobOptions;
    return list.slice(0, 300);
  }, [jobOptions, jobFilter]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      let resolvedJobId: number;
      let resolvedCompany: string;
      let resolvedTitle: string;

      if (mode === 'existing') {
        const selected = jobOptions.find((job) => String(job.id) === jobId);
        if (!selected) throw new Error('Pick a job from the list, or switch to manual entry.');
        resolvedJobId = selected.id;
        resolvedCompany = selected.company_name;
        resolvedTitle = selected.job_title;
      } else {
        resolvedCompany = companyName.trim();
        resolvedTitle = jobTitle.trim();
        if (!resolvedCompany || !resolvedTitle) {
          throw new Error('Company and job title are required.');
        }

        // jobs.job_url is NOT NULL and unique per user — synthesise a stable
        // placeholder when the user has no URL to hand.
        const url =
          emptyToNull(jobUrl) ??
          `manual://${resolvedCompany}-${resolvedTitle}`
            .toLowerCase()
            .replace(/[^a-z0-9:/-]+/g, '-')
            .slice(0, 180);

        const { data: jobRow, error: jobError } = await supabase
          .from('jobs')
          .upsert(
            {
              user_id: userId,
              company_name: resolvedCompany,
              job_title: resolvedTitle,
              job_url: url,
              location: emptyToNull(location),
              source: 'Manual',
              date_scraped: new Date().toISOString(),
            },
            { onConflict: 'user_id,job_url' },
          )
          .select('id')
          .single();

        if (jobError) throw jobError;
        resolvedJobId = (jobRow as { id: number }).id;
      }

      const payload = {
        user_id: userId,
        job_id: resolvedJobId,
        company_name: resolvedCompany,
        job_title: resolvedTitle,
        status,
        date_applied: dateApplied
          ? new Date(`${dateApplied}T00:00:00Z`).toISOString()
          : new Date().toISOString(),
        cover_letter_used: emptyToNull(coverLetter),
        cv_used: emptyToNull(cvUsed),
        interview_date: interviewDate ? new Date(`${interviewDate}:00Z`).toISOString() : null,
        interview_type: emptyToNull(interviewType),
        offer_status: emptyToNull(offerStatus),
        offer_salary_min: parseNumberOrNull(offerSalaryMin),
        offer_salary_max: parseNumberOrNull(offerSalaryMax),
        follow_up_date: followUpDate
          ? new Date(`${followUpDate}T00:00:00Z`).toISOString()
          : null,
        notes: emptyToNull(notes),
      };

      const { data: created, error: insertError } = await supabase
        .from('applications')
        .insert(payload)
        .select('*')
        .single();

      if (insertError) throw insertError;
      onCreated(created as Application);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-application-title"
        className="card relative z-10 my-4 w-full max-w-2xl animate-fade-in"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800">
          <div>
            <h2
              id="new-application-title"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              New application
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Every application is linked to a job row, so pick a scraped job or enter one manually.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(['existing', 'manual'] as Mode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium',
                  mode === value
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
                )}
              >
                {value === 'existing' ? 'From a scraped job' : 'Manual entry'}
              </button>
            ))}
          </div>

          {mode === 'existing' ? (
            <div className="space-y-3">
              {jobsError ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  Could not load the jobs list ({jobsError}). Use manual entry instead.
                </p>
              ) : null}
              <div>
                <label className="label" htmlFor="job-picker-filter">
                  Find a job
                </label>
                <input
                  id="job-picker-filter"
                  className="input"
                  value={jobFilter}
                  onChange={(e) => setJobFilter(e.target.value)}
                  placeholder="Filter by company or title"
                />
              </div>
              <div>
                <label className="label" htmlFor="job-picker">
                  Job ({filteredJobs.length} shown)
                </label>
                <select
                  id="job-picker"
                  className="select"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  size={6}
                >
                  <option value="">— Select a job —</option>
                  {filteredJobs.map((job) => (
                    <option key={job.id} value={String(job.id)}>
                      {job.company_name} — {job.job_title} ({job.source})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="new-company">
                  Company *
                </label>
                <input
                  id="new-company"
                  className="input"
                  required={mode === 'manual'}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="new-title">
                  Job title *
                </label>
                <input
                  id="new-title"
                  className="input"
                  required={mode === 'manual'}
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="new-url">
                  Job URL
                </label>
                <input
                  id="new-url"
                  className="input"
                  type="url"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  placeholder="https://… (optional)"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="new-location">
                  Location
                </label>
                <input
                  id="new-location"
                  className="input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="London, UK"
                />
              </div>
            </div>
          )}

          <hr className="border-slate-200 dark:border-slate-800" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="new-status">
                Status
              </label>
              <select
                id="new-status"
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {APPLICATION_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="new-date-applied">
                Date applied
              </label>
              <input
                id="new-date-applied"
                className="input"
                type="date"
                value={dateApplied}
                onChange={(e) => setDateApplied(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="new-cover-letter">
                Cover letter used
              </label>
              <input
                id="new-cover-letter"
                className="input"
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                placeholder="e.g. ml-generalist-v3"
              />
            </div>

            <div>
              <label className="label" htmlFor="new-cv">
                CV used
              </label>
              <input
                id="new-cv"
                className="input"
                value={cvUsed}
                onChange={(e) => setCvUsed(e.target.value)}
                placeholder="e.g. cv-ai-2026.pdf"
              />
            </div>

            <div>
              <label className="label" htmlFor="new-interview-date">
                Interview date
              </label>
              <input
                id="new-interview-date"
                className="input"
                type="datetime-local"
                value={interviewDate}
                onChange={(e) => setInterviewDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="new-interview-type">
                Interview type
              </label>
              <select
                id="new-interview-type"
                className="select"
                value={interviewType}
                onChange={(e) => setInterviewType(e.target.value)}
              >
                <option value="">—</option>
                {INTERVIEW_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="new-offer-status">
                Outcome / offer status
              </label>
              <select
                id="new-offer-status"
                className="select"
                value={offerStatus}
                onChange={(e) => setOfferStatus(e.target.value)}
              >
                <option value="">—</option>
                {OFFER_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="new-follow-up">
                Follow-up date
              </label>
              <input
                id="new-follow-up"
                className="input"
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="new-offer-min">
                Offer salary min
              </label>
              <input
                id="new-offer-min"
                className="input"
                type="number"
                min={0}
                step={1000}
                value={offerSalaryMin}
                onChange={(e) => setOfferSalaryMin(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="new-offer-max">
                Offer salary max
              </label>
              <input
                id="new-offer-max"
                className="input"
                type="number"
                min={0}
                step={1000}
                value={offerSalaryMax}
                onChange={(e) => setOfferSalaryMax(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="label" htmlFor="new-notes">
                Notes
              </label>
              <textarea
                id="new-notes"
                className="textarea min-h-[4.5rem]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Referral, recruiter name, next steps…"
              />
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
            >
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'Saving…' : 'Add application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
