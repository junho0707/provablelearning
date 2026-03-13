'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export async function signInWithGoogle(redirectTo?: string) {
  const supabase = await createClient();
  const headerStore = await headers();
  const forwardedHost = headerStore.get('x-forwarded-host');
  const origin = forwardedHost
    ? `${headerStore.get('x-forwarded-proto') || 'https'}://${forwardedHost}`
    : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const params = new URLSearchParams();
  if (redirectTo) {
    params.set('redirectTo', redirectTo);
  }
  const callbackUrl = `${origin}/callback${params.toString() ? `?${params.toString()}` : ''}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.url) {
    redirect(data.url);
  }
}
