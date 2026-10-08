import { cn } from '@/lib/utils';

/** Colour mapping for a `job_board_status.status` value. */
export function boardStatusAppearance(status: string | null | undefined) {
  const value = (status ?? 'Unknown').trim();
  switch (value) {
    case 'Working':
      return { label: 'Working', symbol: '✓', className: 'badge-green' };
    case 'Partial':
      return { label: 'Partial', symbol: '⚠', className: 'badge-yellow' };
    case 'Down':
      return { label: 'Down', symbol: '✗', className: 'badge-red' };
    case 'Skipped':
      // Written by the scraper when a board is intentionally not run
      // (missing API credentials, stub source, …).
      return { label: 'Skipped', symbol: '⏭', className: 'badge-grey' };
    default:
      return { label: 'Unknown', symbol: '—', className: 'badge-grey' };
  }
}

export function BoardStatusBadge({ status }: { status: string | null | undefined }) {
  const { label, symbol, className } = boardStatusAppearance(status);
  return (
    <span className={cn('badge', className)}>
      <span aria-hidden="true">{symbol}</span>
      {label}
    </span>
  );
}

const APPLICATION_STATUS_CLASSES: Record<string, string> = {
  Applied: 'badge-blue',
  'In Process': 'badge-indigo',
  Interview: 'badge-purple',
  Offer: 'badge-green',
  Rejected: 'badge-red',
  Withdrawn: 'badge-grey',
};

export function ApplicationStatusBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? 'Applied';
  return (
    <span className={cn('badge', APPLICATION_STATUS_CLASSES[value] ?? 'badge-grey')}>{value}</span>
  );
}

export function VisaBadge({ value }: { value: boolean | null | undefined }) {
  if (value === true) return <span className="badge badge-green">Yes</span>;
  if (value === false) return <span className="badge badge-red">No</span>;
  return <span className="badge badge-grey">Unknown</span>;
}

export function RemoteBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>;
  const className =
    value === 'Remote' ? 'badge-green' : value === 'Hybrid' ? 'badge-blue' : 'badge-grey';
  return <span className={cn('badge', className)}>{value}</span>;
}

export type TrendDirection = 'up' | 'flat' | 'down' | 'unknown';

/**
 * Arrow indicator comparing today's scrape volume with the 7-day rolling
 * average (derived as jobs_this_week / 7). Returns 'unknown' when there is not
 * enough data to make the comparison honestly.
 */
export function deriveTrend(
  jobsToday: number | null | undefined,
  jobsThisWeek: number | null | undefined,
): { direction: TrendDirection; detail: string } {
  if (
    jobsToday === null ||
    jobsToday === undefined ||
    jobsThisWeek === null ||
    jobsThisWeek === undefined ||
    jobsThisWeek <= 0
  ) {
    return { direction: 'unknown', detail: 'Not enough data for a trend' };
  }

  const rollingAverage = jobsThisWeek / 7;
  if (rollingAverage <= 0) return { direction: 'unknown', detail: 'Not enough data for a trend' };

  const ratio = jobsToday / rollingAverage;
  const detail = `Today ${jobsToday} vs 7-day avg ${rollingAverage.toFixed(1)}`;

  if (ratio >= 1.15) return { direction: 'up', detail };
  if (ratio <= 0.85) return { direction: 'down', detail };
  return { direction: 'flat', detail };
}

export function TrendIndicator({
  direction,
  detail,
}: {
  direction: TrendDirection;
  detail?: string;
}) {
  const map: Record<TrendDirection, { symbol: string; className: string; label: string }> = {
    up: { symbol: '↑', className: 'text-emerald-600 dark:text-emerald-400', label: 'Trending up' },
    flat: { symbol: '→', className: 'text-slate-500 dark:text-slate-400', label: 'Flat' },
    down: { symbol: '↓', className: 'text-rose-600 dark:text-rose-400', label: 'Trending down' },
    unknown: { symbol: '—', className: 'text-slate-400 dark:text-slate-500', label: 'Unknown' },
  };
  const { symbol, className, label } = map[direction];
  return (
    <span className={cn('text-base font-semibold', className)} title={detail ?? label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{symbol}</span>
    </span>
  );
}
