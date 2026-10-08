'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { RefreshIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

/** Re-runs the server component queries for the current route. */
export function RefreshButton({ label = 'Refresh' }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function handleClick() {
    setSpinning(true);
    startTransition(() => {
      router.refresh();
    });
    window.setTimeout(() => setSpinning(false), 600);
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={handleClick} disabled={pending}>
      <RefreshIcon className={cn('h-4 w-4', spinning && 'animate-spin')} />
      {label}
    </button>
  );
}
