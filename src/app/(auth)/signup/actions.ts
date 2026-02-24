'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function signupWithPasswordAction(formData: FormData) {
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
      return { error: 'An account with this email already exists. Try logging in.' };
    }
    return { error: error.message };
  }

  redirect('/onboarding');
}
