import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyBookings } from "@/lib/booking/history";
import { getBalance } from "@/lib/credits/balance";
import { POLICY_COPY } from "@/lib/policy";
import { TUTOR_TIMEZONE } from "@/lib/booking/timezone";
import { BookingsList } from "./bookings-list";

export const metadata = { title: "Sessions" };

/** The rules a buyer needs when managing a booked session, straight from the policy module. */
const SESSION_RULES = [
  { title: "Booking window", body: `Up to ${POLICY_COPY.horizon} ahead. ${POLICY_COPY.release}` },
  { title: "Credits", body: `${POLICY_COPY.creditsNeverExpire} Each session uses one.` },
  { title: "Cancel or reschedule", body: POLICY_COPY.freeCancel },
  { title: "Missed it?", body: POLICY_COPY.lateCancel },
];

/** TASK-BOOK-004. Booking only — buying happens on `/credits`, so no checkout redirect can
 * interrupt a slot that's been picked but not confirmed. */
export default async function SessionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sessions");

  const [bookings, balance] = await Promise.all([getMyBookings(), getBalance()]);

  return (
    <main>
      <section className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
        <h1 className="mb-3 text-3xl font-extrabold tracking-[-0.01em] text-navy-950 sm:text-4xl">
          Sessions
        </h1>
        <p className="mb-10 text-lg text-navy-600">
          What&apos;s coming up, and everything you&apos;ve had.
        </p>

        <div className="mb-12 flex flex-wrap items-center gap-3 rounded-xl border border-navy-100 bg-white px-5 py-4 shadow-[var(--shadow-card)]">
          <span className="text-sm text-navy-600">
            <span className="text-lg font-extrabold text-navy-950">{balance}</span>{" "}
            {balance === 1 ? "credit" : "credits"} available
          </span>
          <Link
            href="/credits"
            className="ml-auto rounded-lg border border-navy-200 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:border-navy-400"
          >
            Buy credits
          </Link>
        </div>

        <div className="mb-12">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-navy-950">Your sessions</h2>
            <Link
              href="/book"
              className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
            >
              Book a session
            </Link>
          </div>
          <BookingsList bookings={bookings} />
        </div>

        <div className="mb-12 border-t border-navy-100 pt-10">
          <h2 className="mb-6 text-lg font-bold text-navy-950">Scheduling</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SESSION_RULES.map((rule) => (
              <div
                key={rule.title}
                className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]"
              >
                <h3 className="mb-2 text-lg font-bold text-navy-950">{rule.title}</h3>
                <p className="text-sm leading-relaxed text-navy-700">{rule.body}</p>
              </div>
            ))}
          </div>
        </div>

        <GoogleCalendarPreview />
      </section>
    </main>
  );
}

/**
 * Read-only view of the tutor's booking calendar (`GOOGLE_BOOKING_CALENDAR_ID`) so a learner can
 * sanity-check availability beyond the slot picker. Google's embed only renders events for a
 * calendar that's been shared as "public" in Google Calendar's own sharing settings — that's a
 * one-time manual step outside this app, not something the API can flip.
 */
function GoogleCalendarPreview() {
  const calendarId = process.env.GOOGLE_BOOKING_CALENDAR_ID;
  if (!calendarId) return null;

  const src = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&ctz=${encodeURIComponent(TUTOR_TIMEZONE)}`;

  return (
    <div className="border-t border-navy-100 pt-10">
      <h2 className="mb-6 text-lg font-bold text-navy-950">Tutor&apos;s calendar</h2>
      <div className="overflow-hidden rounded-xl border border-navy-100 bg-white shadow-[var(--shadow-card)]">
        <iframe src={src} className="h-[500px] w-full" title="Tutor's booking calendar" />
      </div>
    </div>
  );
}
