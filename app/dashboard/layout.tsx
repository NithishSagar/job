import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/dashboard-shell';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import type { UserProfile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) {
    redirect('/login');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard/jobs');
  }

  // public.users is created by the on_auth_user_created trigger; fall back to
  // the auth record if the row is missing (e.g. schema applied after signup).
  const { data } = await supabase
    .from('users')
    .select('id, email, full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  const profile = (data ?? null) as Pick<UserProfile, 'id' | 'email' | 'full_name' | 'role'> | null;

  const fullName =
    profile?.full_name ??
    (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null);

  return (
    <DashboardShell
      email={profile?.email ?? user.email ?? ''}
      fullName={fullName}
      role={(profile?.role as string | null) ?? 'owner'}
    >
      {children}
    </DashboardShell>
  );
}
