import { google } from 'googleapis';
import { createAdminClient } from '@/lib/supabase/admin';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/classroom.courses',
  'https://www.googleapis.com/auth/classroom.rosters',
];

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/google-setup/callback`
  );
}

export function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function getAuthedClient() {
  const adminClient = createAdminClient();

  const { data: tokenRow } = await adminClient
    .from('google_tokens')
    .select('*')
    .limit(1)
    .single();

  if (!tokenRow) {
    throw new Error('Google not authorized. Visit /api/auth/google-setup to connect.');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    expiry_date: new Date(tokenRow.token_expiry).getTime(),
  });

  // Auto-refresh if expired
  oauth2Client.on('tokens', async (tokens) => {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (tokens.access_token) updates.access_token = tokens.access_token;
    if (tokens.expiry_date) updates.token_expiry = new Date(tokens.expiry_date).toISOString();
    if (tokens.refresh_token) updates.refresh_token = tokens.refresh_token;

    await adminClient
      .from('google_tokens')
      .update(updates)
      .eq('id', tokenRow.id);
  });

  return oauth2Client;
}
