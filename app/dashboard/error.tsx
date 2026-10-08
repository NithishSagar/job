'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces the real cause in the browser console / Vercel logs.
    console.error('Dashboard render failed:', error);
  }, [error]);

  return (
    <div className="card card-pad max-w-xl">
      <h1 className="text-base font-semibold text-slate-900 dark:text-white">
        Something went wrong loading this page
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        This is usually a Supabase connection problem: missing environment variables, the schema not
        applied yet, or an RLS policy blocking the query.
      </p>
      <p className="mt-2 break-words rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        {error.message}
      </p>
      <button type="button" className="btn btn-primary mt-3" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
