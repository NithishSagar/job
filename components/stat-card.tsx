import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'indigo' | 'green' | 'amber' | 'rose';

const TONES: Record<StatTone, string> = {
  default: 'text-slate-900 dark:text-white',
  indigo: 'text-indigo-600 dark:text-indigo-400',
  green: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  rose: 'text-rose-600 dark:text-rose-400',
};

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatTone;
}) {
  return (
    <div className="card card-pad">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={cn('mt-1.5 text-2xl font-semibold tabular-nums tracking-tight', TONES[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/** Shown when a Supabase query fails (bad env, RLS, offline, …). */
export function QueryError({ message, context }: { message: string; context?: string }) {
  return (
    <div className="card card-pad border-rose-300 bg-rose-50 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
      <p className="font-semibold">{context ?? 'Could not load data from Supabase'}</p>
      <p className="mt-1 break-words font-mono text-xs">{message}</p>
      <p className="mt-2 text-xs">
        Check that your Supabase project is reachable, the schema in{' '}
        <code className="font-mono">supabase/schema.sql</code> has been applied, and the RLS
        policies allow this account to read the table.
      </p>
    </div>
  );
}
