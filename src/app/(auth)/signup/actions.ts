'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export async function signupWithPasswordAction(formData: FormData) {
  if (process.env.DEMO_MODE === 'true') {
    return { error: 'Sign-up is disabled in this portfolio demo.' };
  }

  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/callback`,
    },
  });

  if (error) {
    if (error.message.includes('already registered')) {
      // Check if the existing account uses Google OAuth — link password instead of blocking
      try {
        const adminSupabase = createAdminClient();
        const { data } = await adminSupabase.auth.admin.listUsers();
        const existingUser = data?.users?.find(
          (u) => u.email?.toLowerCase() === email,
        );
        const hasGoogle = existingUser?.app_metadata?.providers?.includes('google');
        if (hasGoogle && existingUser) {
          // Add password identity to the existing Google account
          const { error: updateErr } = await adminSupabase.auth.admin.updateUserById(
            existingUser.id,
            { password },
          );
          if (updateErr) {
            return { error: 'Failed to link password to your Google account. Please try again.' };
          }
          // Sign them in with the newly set password
          const { error: signInErr } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (signInErr) {
            return { error: 'Password linked but sign-in failed. Try logging in.' };
          }
          redirect('/onboarding');
        }
      } catch (err: unknown) {
        const digest = (err as { digest?: string })?.digest;
        if (typeof digest === 'string' && digest.includes('NEXT_REDIRECT')) throw err;
        // Fall through to generic message
      }
      return { error: 'An account with this email already exists. Try logging in.' };
    }
    return { error: error.message };
  }

  redirect('/onboarding');
}
