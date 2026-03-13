'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export async function loginWithPasswordAction(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const redirectTo = formData.get('redirectTo') as string | null;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Check if this email uses Google OAuth (no password set)
    try {
      const adminSupabase = createAdminClient();
      const { data } = await adminSupabase.auth.admin.listUsers();
      const existingUser = data?.users?.find(
        (u) => u.email?.toLowerCase() === email,
      );
      const hasGoogle = existingUser?.app_metadata?.providers?.includes('google');
      const hasEmail = existingUser?.app_metadata?.providers?.includes('email');
      if (hasGoogle && !hasEmail) {
        return { error: 'google_oauth_only' };
      }
    } catch {
      // Fall through to generic message
    }
    return { error: 'Invalid email or password.' };
  }

  // Check if user has a profile to determine where to redirect
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Authentication failed.' };

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role && redirectTo?.startsWith('/')) {
    redirect(redirectTo);
  }

  if (profile?.role) {
    redirect(`/${profile.role}`);
  }

  redirect('/onboarding');
}
