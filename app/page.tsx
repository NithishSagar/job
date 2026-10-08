import { redirect } from 'next/navigation';

import { isSupabaseConfigured } from '@/lib/supabase/env';
import { getCurrentUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  if (!isSupabaseConfigured) {
    redirect('/login');
  }

  const user = await getCurrentUser();
  redirect(user ? '/dashboard/jobs' : '/login');
}
