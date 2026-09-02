import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";

const SESSION_MS = 60 * 60 * 1000;

function calendarClient() {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth });
}

export type CalendarEvent = { eventId: string; meetUrl: string };

/**
 * TASK-BOOK-003. Creates the Calendar event + unique Meet link, inviting the buyer (INV-BOOK-2).
 * Returns `null` on **any** failure instead of throwing — a Google outage must leave a valid
 * booking with a missing link, never lose the booking or block the caller (S10, AT-BOOK-006). The
 * caller (`attachCalendarEvent`) is what makes that failure visible on the admin queue.
 */
export async function createCalendarEvent(params: {
  bookingId: string;
  startsAt: string;
  learnerName: string;
  buyerEmail: string;
}): Promise<CalendarEvent | null> {
  try {
    const calendar = calendarClient();
    const start = new Date(params.startsAt);
    const end = new Date(start.getTime() + SESSION_MS);

    const res = await calendar.events.insert({
      calendarId: process.env.GOOGLE_BOOKING_CALENDAR_ID ?? "primary",
      conferenceDataVersion: 1,
      requestBody: {
        summary: `Tutoring session — ${params.learnerName}`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: [{ email: params.buyerEmail }],
        conferenceData: {
          createRequest: { requestId: params.bookingId, conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      },
    });

    const eventId = res.data.id;
    const meetUrl = res.data.hangoutLink;
    if (!eventId || !meetUrl) return null;
    return { eventId, meetUrl };
  } catch {
    return null;
  }
}

/** Best-effort — a failure here must not surface to the caller (see `createCalendarEvent`). */
export async function cancelCalendarEvent(eventId: string): Promise<void> {
  try {
    await calendarClient().events.delete({
      calendarId: process.env.GOOGLE_BOOKING_CALENDAR_ID ?? "primary",
      eventId,
    });
  } catch {
    // Nothing to do — the booking is already cancelled in our own system either way.
  }
}

/** Best-effort — see `createCalendarEvent`. */
export async function updateCalendarEventTime(eventId: string, startsAt: string): Promise<void> {
  try {
    const start = new Date(startsAt);
    const end = new Date(start.getTime() + SESSION_MS);
    await calendarClient().events.patch({
      calendarId: process.env.GOOGLE_BOOKING_CALENDAR_ID ?? "primary",
      eventId,
      requestBody: { start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } },
    });
  } catch {
    // Nothing to do — the booking already moved in our own system either way.
  }
}

/**
 * Orchestrates the **after-commit** Calendar step for a freshly booked session (INV-BOOK-2): looks
 * up the booking, buyer email, and learner name via the service-role client (this runs outside any
 * buyer's request-scoped RLS context — it's a trusted background step, not a buyer action), then
 * writes `meet_url`/`calendar_event_id` back if Google succeeded. Silently does nothing on
 * failure — `meet_url` simply stays null, which is what surfaces the booking on the admin queue.
 */
export async function attachCalendarEvent(bookingId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, starts_at, account_id, profile_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return;

  const [{ data: authUser }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(booking.account_id),
    admin.from("learner_profiles").select("name").eq("id", booking.profile_id).maybeSingle(),
  ]);
  const buyerEmail = authUser?.user?.email;
  if (!buyerEmail) return;

  const event = await createCalendarEvent({
    bookingId: booking.id,
    startsAt: booking.starts_at,
    learnerName: profile?.name ?? "your learner",
    buyerEmail,
  });
  if (!event) return;

  await admin
    .from("bookings")
    .update({ meet_url: event.meetUrl, calendar_event_id: event.eventId })
    .eq("id", bookingId);
}
