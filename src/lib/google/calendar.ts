import { google } from 'googleapis';
import { getAuthedClient } from './auth';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

export async function createClassEvent({
  summary,
  startDate,
  meetingDay,
  meetingTime,
  weeksCount,
  attendeeEmail,
  meetLink,
}: {
  summary: string;
  startDate: string;       // e.g. "2026-03-02"
  meetingDay: string;       // e.g. "Monday"
  meetingTime: string;      // e.g. "15:00"
  weeksCount: number;
  attendeeEmail: string;
  meetLink?: string | null;
}) {
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  // Calculate first class date (find the right day of week from start_date)
  const dayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  const targetDay = dayMap[meetingDay] ?? 1;
  const start = new Date(`${startDate}T${meetingTime}:00`);

  // Advance to the correct day of week
  while (start.getDay() !== targetDay) {
    start.setDate(start.getDate() + 1);
  }

  const endTime = new Date(start);
  endTime.setHours(endTime.getHours() + 1); // 1 hour sessions

  // RRULE: weekly for weeksCount * 2 sessions per week = weeksCount sessions
  const rruleCount = weeksCount * 2; // 8 sessions for 4-week course

  const description = meetLink ? `Join: ${meetLink}` : '';

  const event = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary,
      description,
      start: {
        dateTime: start.toISOString(),
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/New_York',
      },
      recurrence: [`RRULE:FREQ=WEEKLY;COUNT=${rruleCount}`],
      attendees: [{ email: attendeeEmail }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    },
    sendUpdates: 'all',
  });

  return event.data;
}

export async function createClassCalendarBlock({
  summary,
  startDate,
  meetingDay,
  meetingTime,
  weeksCount,
  meetLink,
}: {
  summary: string;
  startDate: string;       // e.g. "2026-03-02"
  meetingDay: string;       // e.g. "Monday"
  meetingTime: string;      // e.g. "15:00"
  weeksCount: number;
  meetLink?: string | null;
}) {
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const dayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  const targetDay = dayMap[meetingDay] ?? 1;
  const start = new Date(`${startDate}T${meetingTime}:00`);

  while (start.getDay() !== targetDay) {
    start.setDate(start.getDate() + 1);
  }

  const endTime = new Date(start);
  endTime.setHours(endTime.getHours() + 1);

  const description = meetLink ? `Join: ${meetLink}` : '';

  const event = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary,
      description,
      start: {
        dateTime: start.toISOString(),
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/New_York',
      },
      recurrence: [`RRULE:FREQ=WEEKLY;COUNT=${weeksCount}`],
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 10 }],
      },
    },
  });

  return event.data;
}

export async function deleteClassCalendarBlock(eventId: string) {
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  await calendar.events.delete({
    calendarId: CALENDAR_ID,
    eventId,
  });
}

export async function getFreeBusy(startDate: string, endDate: string) {
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      items: [{ id: CALENDAR_ID }],
    },
  });

  return res.data.calendars?.[CALENDAR_ID]?.busy || [];
}

export async function createBookingEvent({
  parentName,
  parentEmail,
  dateTime,
  durationMin,
  context,
}: {
  parentName: string;
  parentEmail: string;
  dateTime: string;
  durationMin: number;
  context?: { studentName?: string; className?: string };
}) {
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const start = new Date(dateTime);
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  const isRefund = !!context?.studentName;
  const summary = isRefund
    ? `Refund Consultation: ${parentName}`
    : `Meeting: ${parentName}`;
  const descParts = [`Parent consultation with ${parentName} (${parentEmail})`];
  if (context?.studentName) descParts.push(`Student: ${context.studentName}`);
  if (context?.className) descParts.push(`Class: ${context.className}`);

  const event = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary,
      description: descParts.join('\n'),
      start: {
        dateTime: start.toISOString(),
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: 'America/New_York',
      },
      attendees: [{ email: parentEmail }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    },
    sendUpdates: 'all',
  });

  return event.data;
}
