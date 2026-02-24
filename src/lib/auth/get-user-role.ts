import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types';

export async function getUserRole(): Promise<{
  userId: string;
  role: UserRole;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return { userId: user.id, role: profile.role as UserRole };
}
