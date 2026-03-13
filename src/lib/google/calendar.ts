import { google } from 'googleapis';
import { getAuthedClient } from './auth';
import { SESSION_DURATION_HOURS } from '@/lib/constants';
import type { GroupSizeType } from '@/lib/types';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;
const BOOKING_CALENDAR_ID = process.env.GOOGLE_BOOKING_CALENDAR_ID || CALENDAR_ID;

/** Format a Date as YYYY-MM-DDTHH:MM:00 (no Z, no offset) for Google Calendar timeZone usage */
function formatLocalDT(dt: Date): string {
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const h = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${mi}:00`;
}

/** Build an America/New_York datetime string without relying on system TZ */
function buildETDateTime(dateStr: string, timeStr: string, dayOfWeek: number): string {
  const t = timeStr.length > 5 ? timeStr.slice(0, 5) : timeStr;
  const cursor = new Date(`${dateStr}T${t}:00`);
  while (cursor.getDay() !== dayOfWeek) {
    cursor.setDate(cursor.getDate() + 1);
  }
  return formatLocalDT(cursor);
}

export async function createClassEvent({
  summary,
  startDate,
  meetingDay,
  meetingTime,
  weeksCount,
  attendeeEmail,
  groupSizeType = 'large',
}: {
  summary: string;
  startDate: string;       // e.g. "2026-03-02"
  meetingDay: string;       // e.g. "Monday"
  meetingTime: string;      // e.g. "15:00"
  weeksCount: number;
  attendeeEmail: string;
  groupSizeType?: GroupSizeType;
}) {
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const dayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  const targetDay = dayMap[meetingDay] ?? 1;
  const durationHours = SESSION_DURATION_HOURS[groupSizeType] ?? 1.5;
  const durationMinutes = durationHours * 60;

  const startDT = buildETDateTime(startDate, meetingTime, targetDay);
  const endDate = new Date(`${startDT}`);
  endDate.setMinutes(endDate.getMinutes() + durationMinutes);
  const endDT = formatLocalDT(endDate);

  // RRULE: weekly for weeksCount sessions (one per week per meeting day)
  const rruleCount = weeksCount;

  const event = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    conferenceDataVersion: 1,
    requestBody: {
      summary,
      start: {
        dateTime: startDT,
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: endDT,
        timeZone: 'America/New_York',
      },
      recurrence: [`RRULE:FREQ=WEEKLY;COUNT=${rruleCount}`],
      attendees: [{ email: attendeeEmail }],
      conferenceData: {
        createRequest: {
          requestId: `class-event-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
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

  // Extract auto-generated Meet link
  const meetLink =
    event.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video',
    )?.uri ?? null;

  return { ...event.data, meetLink };
}

export async function createClassCalendarBlock({
  summary,
  startDate,
  meetingDay,
  meetingTime,
  weeksCount,
  untilDate,
  groupSizeType = 'small',
}: {
  summary: string;
  startDate: string;       // e.g. "2026-03-02"
  meetingDay: string;       // e.g. "Monday"
  meetingTime: string;      // e.g. "15:00"
  weeksCount?: number;      // LG: fixed count
  untilDate?: string;       // SG/1:1: recur until this date (YYYY-MM-DD)
  groupSizeType?: GroupSizeType;
}) {
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const dayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  const targetDay = dayMap[meetingDay] ?? 1;
  const durationHours = SESSION_DURATION_HOURS[groupSizeType] ?? 1.5;
  const durationMinutes = durationHours * 60;

  const startDT = buildETDateTime(startDate, meetingTime, targetDay);
  const endDate = new Date(`${startDT}`);
  endDate.setMinutes(endDate.getMinutes() + durationMinutes);
  const endDT = formatLocalDT(endDate);

  // Build RRULE: use UNTIL date for SG/1:1, COUNT for LG
  let rrule: string;
  if (untilDate) {
    // UNTIL format: YYYYMMDDTHHMMSSZ (end of day Saturday in UTC)
    const until = new Date(`${untilDate}T23:59:59Z`);
    const untilStr = until.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    rrule = `RRULE:FREQ=WEEKLY;UNTIL=${untilStr}`;
  } else {
    rrule = `RRULE:FREQ=WEEKLY;COUNT=${weeksCount ?? 4}`;
  }

  const event = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    conferenceDataVersion: 1,
    requestBody: {
      summary,
      start: {
        dateTime: startDT,
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: endDT,
        timeZone: 'America/New_York',
      },
      recurrence: [rrule],
      conferenceData: {
        createRequest: {
          requestId: `class-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 10 }],
      },
    },
  });

  // Extract auto-generated Meet link (may not be in initial response — re-fetch if needed)
  let meetLink =
    event.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video',
    )?.uri ?? null;

  if (!meetLink && event.data.id) {
    // Conference creation is async — re-fetch event after a short delay
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const refetched = await calendar.events.get({
        calendarId: CALENDAR_ID,
        eventId: event.data.id,
      });
      meetLink =
        refetched.data.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === 'video',
        )?.uri ?? null;
    } catch {
      // Non-critical — meet link can be added manually
    }
  }

  return { ...event.data, meetLink };
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
      items: [{ id: BOOKING_CALENDAR_ID }],
    },
  });

  return res.data.calendars?.[BOOKING_CALENDAR_ID]?.busy || [];
}

export async function createBookingEvent({
  parentName,
  parentEmail,
  parentPhone,
  dateTime,
  durationMin,
  meetingType = 'meet',
  context,
}: {
  parentName: string;
  parentEmail: string;
  parentPhone?: string;
  dateTime: string;
  durationMin: number;
  meetingType?: 'meet' | 'phone';
  context?: { studentName?: string; className?: string };
}) {
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const start = new Date(dateTime);
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  const isRefund = !!context?.studentName;
  const summary = isRefund
    ? `Refund Consultation: ${parentName}`
    : `Consultation Meeting: ${parentName}`;
  const descParts = [`Parent consultation with ${parentName} (${parentEmail})`];
  if (context?.studentName) descParts.push(`Student: ${context.studentName}`);
  if (context?.className) descParts.push(`Class: ${context.className}`);
  if (meetingType === 'phone' && parentPhone) {
    descParts.push(`Phone call — tutor will call ${parentPhone}`);
  }

  const conferenceData =
    meetingType === 'meet'
      ? {
          createRequest: {
            requestId: `booking-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' as const },
          },
        }
      : undefined;

  const event = await calendar.events.insert({
    calendarId: BOOKING_CALENDAR_ID,
    conferenceDataVersion: meetingType === 'meet' ? 1 : undefined,
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
      conferenceData,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
        ],
      },
    },
    sendUpdates: 'none',
  });

  // Extract Meet link from conference data entry points
  const meetLink =
    event.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video',
    )?.uri ?? null;

  return { ...event.data, meetLink };
}
