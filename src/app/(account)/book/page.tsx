import Link from "next/link";
import { redirect } from "next/navigation";
import { currentBuyerId } from "@/lib/auth/session";
import { getOpenAvailability } from "@/lib/booking/availability";
import { listProfiles } from "@/lib/accounts/profiles";
import { listUnusedFirstSessions } from "@/lib/assessment/first-session";
import { getMyBookings } from "@/lib/booking/history";
import { getBalance } from "@/lib/credits/balance";
import { POLICY_COPY } from "@/lib/policy";
import { BookingForm } from "./booking-form";
import { BTN_LG, H1 } from "@/lib/ui";

export const metadata = { title: "Book a session" };

/** Booking (F5). Kept apart from `/credits` so no checkout redirect can interrupt a picked slot. */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const buyerId = await currentBuyerId();
  if (!buyerId) redirect("/login?next=/book");

  const [slots, profiles, unusedFirstSessions, bookings, balance, params] = await Promise.all([
    getOpenAvailability(),
    listProfiles(),
    listUnusedFirstSessions(),
    getMyBookings(),
    getBalance(),
    searchParams,
  ]);

  if (profiles.length === 0) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-24 text-center sm:px-10">
        <h1 className={H1}>Book a session</h1>
        <p className="mt-4 text-[0.9375rem] leading-relaxed text-navy-700">
          Add a student first — a session is booked for someone.
        </p>
        <Link href="/account" className={`mt-10 ${BTN_LG}`}>
          Add a student
        </Link>
      </main>
    );
  }

  // Bought-and-unused, not "never bought" — those students are still being offered the $49
  // purchase and must not be handed a free booking.
  const prepaid = new Set(unusedFirstSessions);
  const hasHistory = new Set(
    bookings.filter((b) => b.status !== "cancelled").map((b) => b.profileId),
  );

  const students = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    primaryPurpose: p.primaryPurpose,
    secondaryPurpose: p.secondaryPurpose,
    hasFirstSession: prepaid.has(p.id),
    hasPreviousSession: hasHistory.has(p.id),
  }));

  return (
    <main className="mx-auto max-w-[720px] px-6 py-16 sm:px-10">
      <h1 className={H1}>Book a session</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-navy-700">
        60 minutes, 1:1. {POLICY_COPY.release} {POLICY_COPY.freeCancel}
      </p>
      <div className="mt-10">
        <BookingForm
          slots={slots}
          students={students}
          balance={balance}
          initialStudentId={params.student}
        />
      </div>
    </main>
  );
}
