import { createClient } from '@/lib/supabase/server';

export interface NavProps {
  userRole: string | null;
  userName: string | null;
  showPayments: boolean;
}

/** Fetch the props needed by ServerNav. Safe to call on public pages (returns nulls if not logged in). */
export async function getNavProps(): Promise<NavProps> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { userRole: null, userName: null, showPayments: false };

  const { data: profile } = await supabase
    .from('users')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  if (!profile) return { userRole: null, userName: null, showPayments: false };

  const userRole = profile.role as string;
  const userName = profile.full_name as string | null;

  let showPayments = false;
  if (userRole === 'parent') {
    showPayments = true;
  } else if (userRole === 'student') {
    const { data: student } = await supabase
      .from('students')
      .select('parent_id')
      .eq('user_id', user.id)
      .single();
    showPayments = !student?.parent_id;
  }

  return { userRole, userName, showPayments };
}
