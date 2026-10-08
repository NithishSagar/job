'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/utils';

type Mode = 'signin' | 'signup';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);

    try {
      const supabase = createClient();

      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;

        router.replace(next);
        router.refresh();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() || null },
          emailRedirectTo:
            typeof window === 'undefined' ? undefined : `${window.location.origin}${next}`,
        },
      });
      if (signUpError) throw signUpError;

      if (data.session) {
        router.replace(next);
        router.refresh();
        return;
      }

      setInfo(
        'Account created. Check your inbox for the confirmation email, then come back and sign in.',
      );
      setMode('signin');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => {
            setMode('signin');
            setError(null);
          }}
          className={
            mode === 'signin'
              ? 'rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
              : 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
          }
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('signup');
            setError(null);
          }}
          className={
            mode === 'signup'
              ? 'rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
              : 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
          }
        >
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'signup' ? (
          <div>
            <label className="label" htmlFor="full_name">
              Full name
            </label>
            <input
              id="full_name"
              className="input"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nithish"
            />
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {mode === 'signup' ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              At least 6 characters.
            </p>
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
          >
            {error}
          </p>
        ) : null}

        {info ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            {info}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
