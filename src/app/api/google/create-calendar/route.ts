import { google } from 'googleapis';
import { getAuthedClient } from '@/lib/google/auth';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const auth = await getAuthedClient();
    const calendar = google.calendar({ version: 'v3', auth });

    // Create a new calendar called "Tutoring"
    const res = await calendar.calendars.insert({
      requestBody: {
        summary: 'Tutoring',
        description: 'Provable Learning tutoring schedule — classes, makeups, and consultations',
        timeZone: 'America/New_York',
      },
    });

    const calendarId = res.data.id;

    // Make calendar publicly readable (so public page can show free/busy)
    await calendar.acl.insert({
      calendarId: calendarId!,
      requestBody: {
        role: 'reader',
        scope: { type: 'default' },
      },
    });

    return NextResponse.json({
      success: true,
      calendarId,
      message: `Calendar "Tutoring" created. Update GOOGLE_CALENDAR_ID=${calendarId} in .env.local`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to create calendar:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
