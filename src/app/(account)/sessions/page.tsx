import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyBookings } from "@/lib/booking/history";
import { POLICY_COPY } from "@/lib/policy";
import { BookingsList } from "./bookings-list";
import { BTN, H1, H2, H3 } from "@/lib/ui";

export const metadata = { title: "Sessions" };

/** The rules a buyer needs when managing a booked session, straight from the policy module. */
const SESSION_RULES = [
  { title: "Booking window", body: `Up to ${POLICY_COPY.horizon} ahead. ${POLICY_COPY.release}` },
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

  const bookings = await getMyBookings();

  return (
    <main className="mx-auto max-w-[1200px] px-6 py-16 sm:px-10">
      <h1 className={H1}>Sessions</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-navy-700">
        What&apos;s coming up, and everything you&apos;ve had.
      </p>

      <section className="mt-12 border-t border-navy-950/10 pt-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h2 className={H2}>Your sessions</h2>
          <Link href="/book" className={BTN}>
            Book a session
          </Link>
        </div>
        <BookingsList bookings={bookings} />
      </section>

      {/* The same three rules the landing states, in the same hairline grid it states them in. */}
      <section className="mt-12 border-t border-navy-950/10 pt-10">
        <h2 className={`mb-8 ${H2}`}>Scheduling</h2>
        <div className="grid border-y border-navy-950/10 sm:grid-cols-3">
          {SESSION_RULES.map((rule) => (
            <div
              key={rule.title}
              className="border-b border-navy-950/10 py-8 last:border-b-0 sm:border-b-0 sm:border-r sm:px-8 sm:py-10 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
            >
              <h3 className={`mb-3 ${H3}`}>{rule.title}</h3>
              <p className="text-[0.9375rem] leading-relaxed text-navy-700">{rule.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
