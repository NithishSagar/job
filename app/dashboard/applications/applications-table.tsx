'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { NewApplicationDialog } from '@/app/dashboard/applications/new-application-dialog';
import { PlusIcon, SearchIcon, TrashIcon } from '@/components/icons';
import { EmptyState } from '@/components/stat-card';
import {
  APPLICATION_STATUSES,
  INTERVIEW_TYPES,
  OFFER_STATUSES,
  type ApplicationStatus,
} from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import type { Application, JobOption } from '@/lib/types';
import {
  cn,
  emptyToNull,
  errorMessage,
  formatNumber,
  toDateInputValue,
  toDateTimeInputValue,
} from '@/lib/utils';

/** Columns that can be edited inline. */
type EditablePatch = Partial<
  Pick<
    Application,
    | 'status'
    | 'notes'
    | 'interview_date'
    | 'interview_type'
    | 'offer_status'
    | 'follow_up_date'
    | 'cover_letter_used'
    | 'date_applied'
    | 'date_of_response'
  >
>;

const STATUS_CELL_CLASSES: Record<string, string> = {
  Applied: 'border-blue-300 text-blue-800 dark:border-blue-500/40 dark:text-blue-300',
  'In Process': 'border-indigo-300 text-indigo-800 dark:border-indigo-500/40 dark:text-indigo-300',
  Interview: 'border-violet-300 text-violet-800 dark:border-violet-500/40 dark:text-violet-300',
  Offer: 'border-emerald-300 text-emerald-800 dark:border-emerald-500/40 dark:text-emerald-300',
  Rejected: 'border-rose-300 text-rose-800 dark:border-rose-500/40 dark:text-rose-300',
  Withdrawn: 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300',
};

export function ApplicationsTable({
  applications,
  jobOptions,
  userId,
  jobsError,
}: {
  applications: Application[];
  jobOptions: JobOption[];
  userId: string;
  jobsError: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Application[]>(applications);
  const [statusFilter, setStatusFilter] = useState<'all' | ApplicationStatus>('all');
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!term) return true;
      return `${row.company_name} ${row.job_title} ${row.notes ?? ''}`.toLowerCase().includes(term);
    });
  }, [rows, statusFilter, search]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => map.set(row.status, (map.get(row.status) ?? 0) + 1));
    return map;
  }, [rows]);

  async function updateRow(id: number, patch: EditablePatch) {
    const previous = rows.find((row) => row.id === id);
    if (!previous) return;

    // Optimistic update, rolled back if Supabase rejects it.
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setSavingId(id);
    setError(null);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('applications')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (updateError) throw updateError;
      router.refresh();
    } catch (err) {
      setRows((current) => current.map((row) => (row.id === id ? previous : row)));
      setError(`Could not save change: ${errorMessage(err)}`);
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(row: Application) {
    const confirmed = window.confirm(
      `Delete the application for "${row.job_title}" at ${row.company_name}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setSavingId(row.id);
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.from('applications').delete().eq('id', row.id);
      if (deleteError) throw deleteError;
      setRows((current) => current.filter((item) => item.id !== row.id));
      router.refresh();
    } catch (err) {
      setError(`Could not delete: ${errorMessage(err)}`);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* ---------------- toolbar ---------------- */}
      <div className="card card-pad">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
            <div>
              <label className="label" htmlFor="app-search">
                Search
              </label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="app-search"
                  className="input pl-8"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Company, title or notes"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="app-status-filter">
                Status
              </label>
              <select
                id="app-status-filter"
                className="select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | ApplicationStatus)}
              >
                <option value="all">All statuses ({rows.length})</option>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status} ({counts.get(status) ?? 0})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button type="button" className="btn btn-primary" onClick={() => setDialogOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            New application
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Showing {formatNumber(filtered.length)} of {formatNumber(rows.length)}
          {savingId !== null ? ' · saving…' : ''}
        </p>
      </div>

      {error ? (
        <div className="card card-pad border-rose-300 bg-rose-50 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {/* ---------------- table ---------------- */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? 'No applications tracked yet' : 'No applications match'}
            description={
              rows.length === 0
                ? 'Mark a job as applied from the Jobs page, or add one manually here.'
                : 'Try a different status filter or search term.'
            }
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm mt-2"
                onClick={() => setDialogOpen(true)}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                New application
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Job Title</th>
                  <th>Date Applied</th>
                  <th>Cover Letter Used</th>
                  <th>Status</th>
                  <th>Interview Date</th>
                  <th>Interview Type</th>
                  <th>Outcome</th>
                  <th>Follow-up</th>
                  <th className="min-w-[14rem]">Notes</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className={cn(savingId === row.id && 'opacity-60')}>
                    <td className="nowrap font-medium text-slate-900 dark:text-white">
                      {row.company_name}
                    </td>

                    <td className="max-w-[14rem]">{row.job_title}</td>

                    <td>
                      <input
                        type="date"
                        aria-label={`Date applied for ${row.company_name}`}
                        className="input input-sm w-[8.5rem]"
                        value={toDateInputValue(row.date_applied)}
                        onChange={(e) =>
                          updateRow(row.id, {
                            date_applied: e.target.value
                              ? new Date(`${e.target.value}T00:00:00Z`).toISOString()
                              : null,
                          })
                        }
                      />
                    </td>

                    <td>
                      <InlineText
                        value={row.cover_letter_used}
                        placeholder="e.g. ml-generalist-v3"
                        ariaLabel={`Cover letter used for ${row.company_name}`}
                        onCommit={(value) => updateRow(row.id, { cover_letter_used: value })}
                        className="w-[11rem]"
                      />
                    </td>

                    <td>
                      <select
                        aria-label={`Status for ${row.company_name}`}
                        className={cn(
                          'select select-sm w-[7.5rem] font-medium',
                          STATUS_CELL_CLASSES[row.status] ?? '',
                        )}
                        value={row.status}
                        onChange={(e) => updateRow(row.id, { status: e.target.value })}
                      >
                        {APPLICATION_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                        {APPLICATION_STATUSES.includes(row.status as ApplicationStatus) ? null : (
                          <option value={row.status}>{row.status}</option>
                        )}
                      </select>
                    </td>

                    <td>
                      <input
                        type="datetime-local"
                        aria-label={`Interview date for ${row.company_name}`}
                        className="input input-sm w-[12rem]"
                        value={toDateTimeInputValue(row.interview_date)}
                        onChange={(e) =>
                          updateRow(row.id, {
                            interview_date: e.target.value
                              ? new Date(`${e.target.value}:00Z`).toISOString()
                              : null,
                          })
                        }
                      />
                    </td>

                    <td>
                      <select
                        aria-label={`Interview type for ${row.company_name}`}
                        className="select select-sm w-[7.5rem]"
                        value={row.interview_type ?? ''}
                        onChange={(e) =>
                          updateRow(row.id, { interview_type: emptyToNull(e.target.value) })
                        }
                      >
                        <option value="">—</option>
                        {INTERVIEW_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <select
                        aria-label={`Offer status for ${row.company_name}`}
                        className="select select-sm w-[8rem]"
                        value={row.offer_status ?? ''}
                        onChange={(e) =>
                          updateRow(row.id, { offer_status: emptyToNull(e.target.value) })
                        }
                      >
                        <option value="">—</option>
                        {OFFER_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <input
                        type="date"
                        aria-label={`Follow-up date for ${row.company_name}`}
                        className="input input-sm w-[8.5rem]"
                        value={toDateInputValue(row.follow_up_date)}
                        onChange={(e) =>
                          updateRow(row.id, {
                            follow_up_date: e.target.value
                              ? new Date(`${e.target.value}T00:00:00Z`).toISOString()
                              : null,
                          })
                        }
                      />
                    </td>

                    <td>
                      <InlineText
                        value={row.notes}
                        placeholder="Add a note…"
                        ariaLabel={`Notes for ${row.company_name}`}
                        onCommit={(value) => updateRow(row.id, { notes: value })}
                        multiline
                        className="w-full min-w-[13rem]"
                      />
                    </td>

                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        onClick={() => deleteRow(row)}
                        aria-label={`Delete application for ${row.company_name}`}
                        title="Delete application"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogOpen ? (
        <NewApplicationDialog
          userId={userId}
          jobOptions={jobOptions}
          jobsError={jobsError}
          onClose={() => setDialogOpen(false)}
          onCreated={(created) => {
            setRows((current) => [created, ...current]);
            setDialogOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Text cell that keeps local keystrokes local and only writes to Supabase on
 * blur (or Enter), so typing a note doesn't fire a request per character.
 */
function InlineText({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  multiline = false,
  className,
}: {
  value: string | null;
  onCommit: (value: string | null) => void;
  placeholder?: string;
  ariaLabel: string;
  multiline?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);

  // Keep in sync when the row is refreshed from the server and not being edited.
  const current = focused ? draft : (value ?? '');

  function commit() {
    setFocused(false);
    const next = emptyToNull(draft);
    if (next !== (value ?? null)) onCommit(next);
  }

  const shared = {
    'aria-label': ariaLabel,
    placeholder,
    value: current,
    onFocus: () => {
      setDraft(value ?? '');
      setFocused(true);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: commit,
  };

  if (multiline) {
    return (
      <textarea
        {...shared}
        rows={1}
        className={cn('textarea input-sm', className)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <input
      {...shared}
      type="text"
      className={cn('input input-sm', className)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
