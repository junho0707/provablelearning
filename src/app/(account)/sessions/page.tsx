import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOpenAvailability } from "@/lib/booking/availability";
import { getMyBookings } from "@/lib/booking/history";
import { listProfiles } from "@/lib/accounts/profiles";
import { getBalance } from "@/lib/credits/balance";
import { TUTOR_TIMEZONE } from "@/lib/booking/timezone";
import { BookingPicker } from "./booking-picker";
import { BookingsList } from "./bookings-list";

export const metadata = { title: "Sessions" };

/** spec/14 §15 — the rules a buyer needs before spending a credit, not buried in a paragraph. */
const SESSION_RULES = [
  { title: "Booking window", body: "Book up to 4 weeks ahead, with at least 24 hours' notice." },
  { title: "Credits", body: "Never expire. Each session uses one." },
  {
    title: "Cancel or reschedule",
    body: "Free at 24 hours or more ahead. Inside 24 hours uses the credit — you can request it back.",
  },
  { title: "No-show", body: "15 minutes late counts as a no-show — you can request the credit back." },
];

/** TASK-BOOK-004. Booking only — buying happens on `/credits`, so no checkout redirect can
 * interrupt a slot that's been picked but not confirmed. */
export default async function SessionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sessions");

  const [slots, profiles, bookings, balance] = await Promise.all([
    getOpenAvailability(),
    listProfiles(),
    getMyBookings(),
    getBalance(),
  ]);

  return (
    <main>
      <section className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
        <h1 className="mb-3 text-3xl font-extrabold tracking-[-0.01em] text-navy-950 sm:text-4xl">
          Sessions
        </h1>
        <p className="mb-10 text-lg text-navy-600">
          Book your 1 hour 1:1 sessions and manage what&apos;s coming up.
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
          <h2 className="mb-6 text-lg font-bold text-navy-950">Pick a time</h2>
          <BookingPicker
            slots={slots}
            profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
            balance={balance}
          />
        </div>

        <div className="mb-12 border-t border-navy-100 pt-10">
          <h2 className="mb-6 text-lg font-bold text-navy-950">Your sessions</h2>
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
