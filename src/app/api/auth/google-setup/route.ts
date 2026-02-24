import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthUrl } from '@/lib/google/auth';

export async function GET() {
  // Only admins can set up Google auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const url = getAuthUrl();
  return NextResponse.redirect(url);
}
