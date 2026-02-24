import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOAuth2Client } from '@/lib/google/auth';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  // Verify admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // Exchange code for tokens
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.refresh_token) {
    return NextResponse.json(
      { error: 'No refresh token received. Try revoking app access at myaccount.google.com/permissions and retry.' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Upsert token row
  const { data: existing } = await adminClient
    .from('google_tokens')
    .select('id')
    .eq('user_id', user.id)
    .single();

  const tokenData = {
    user_id: user.id,
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token,
    token_expiry: new Date(tokens.expiry_date!).toISOString(),
    scopes: (tokens.scope || '').split(' '),
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error: updateErr } = await adminClient
      .from('google_tokens')
      .update(tokenData)
      .eq('id', existing.id);
    if (updateErr) {
      console.error('google_tokens update error:', updateErr);
      return NextResponse.json({ error: 'Failed to update token', detail: updateErr }, { status: 500 });
    }
  } else {
    const { error: insertErr } = await adminClient.from('google_tokens').insert(tokenData);
    if (insertErr) {
      console.error('google_tokens insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to save token', detail: insertErr }, { status: 500 });
    }
  }

  return NextResponse.redirect(new URL('/admin?google=connected', request.url));
}
