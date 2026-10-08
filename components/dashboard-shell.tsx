'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CloseIcon, LogoutIcon, MenuIcon, NavIcon } from '@/components/icons';
import { NAV_ITEMS } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export function DashboardShell({
  email,
  fullName,
  role,
  children,
}: {
  email: string;
  fullName: string | null;
  role: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const activeItem = NAV_ITEMS.find((item) => pathname.startsWith(item.href));

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Even if the network call fails we still send the user to /login.
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  const nav = (
    <nav className="flex-1 space-y-1 px-3">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
            )}
          >
            <NavIcon name={item.icon} className="h-[1.1rem] w-[1.1rem] shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const userBlock = (
    <div className="border-t border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-2 px-1">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {fullName || email}
        </p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {email}
          {role ? ` · ${role}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="btn btn-secondary w-full"
      >
        <LogoutIcon className="h-4 w-4" />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* ---------- desktop sidebar ---------- */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-screen dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            JH
          </span>
          <span className="text-sm font-semibold leading-tight text-slate-900 dark:text-white">
            JobHunt
            <br />
            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
              Command Center
            </span>
          </span>
        </div>
        {nav}
        {userBlock}
      </aside>

      {/* ---------- mobile drawer ---------- */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 flex w-64 animate-fade-in flex-col border-r border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between px-4 py-4">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                JobHunt Command Center
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="btn btn-ghost btn-sm"
                aria-label="Close navigation"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {userBlock}
          </div>
        </div>
      ) : null}

      {/* ---------- main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/90">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="btn btn-ghost btn-sm"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            {activeItem?.label ?? 'JobHunt'}
          </span>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
