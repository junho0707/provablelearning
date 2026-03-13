import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Clear ALL Supabase auth cookies including PKCE code verifier
  // signOut() only clears session tokens, leaving stale PKCE state
  // that causes bad_oauth_state on the next login attempt
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const response = NextResponse.redirect(new URL('/login', request.url));

  for (const cookie of allCookies) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.delete(cookie.name);
    }
  }

  return response;
}
