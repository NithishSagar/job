import type { Metadata } from 'next';

import { LoginForm } from '@/app/login/login-form';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; message?: string };
}) {
  const next =
    searchParams?.next && searchParams.next.startsWith('/') ? searchParams.next : '/dashboard/jobs';

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 px-4 py-10 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/40">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-lg shadow-indigo-600/20">
            JH
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            JobHunt Command Center
          </h1>
          <p className="page-subtitle">AI/ML job search, tracked end to end.</p>
        </div>

        {!isSupabaseConfigured ? (
          <div className="card card-pad mb-4 border-amber-300 bg-amber-50 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <p className="font-semibold">Supabase is not configured</p>
            <p className="mt-1">
              Set <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{' '}
              <code className="font-mono text-xs">.env.local</code> (or in your Vercel project) and
              restart. See <code className="font-mono text-xs">.env.example</code>.
            </p>
          </div>
        ) : null}

        {searchParams?.message ? (
          <div className="card card-pad mb-4 text-sm text-slate-700 dark:text-slate-200">
            {searchParams.message}
          </div>
        ) : null}

        <LoginForm next={next} />

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Private dashboard. Access is granted per-account by invite.
        </p>
      </div>
    </main>
  );
}
