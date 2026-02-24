import { createClient } from '@/lib/supabase/client';

export async function signInWithGoogle(redirectTo?: string) {
  const supabase = createClient();

  const params = new URLSearchParams();
  if (redirectTo) {
    params.set('redirectTo', redirectTo);
  }
  const callbackUrl = `${window.location.origin}/callback${params.toString() ? `?${params.toString()}` : ''}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) throw error;
  return data;
}
