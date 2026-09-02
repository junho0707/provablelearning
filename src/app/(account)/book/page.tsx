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
      <main className="mx-auto max-w-lg px-5 py-20 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-950">Book a session</h1>
        <p className="mt-3 text-navy-700">Add a student first — a session is booked for someone.</p>
        <Link
          href="/account"
          className="mt-6 inline-block rounded-lg bg-navy-900 px-5 py-2.5 font-semibold text-white hover:bg-navy-800"
        >
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
    <main className="mx-auto max-w-[720px] px-5 py-16 sm:px-8">
      <h1 className="text-3xl font-extrabold tracking-[-0.01em] text-navy-950">Book a session</h1>
      <p className="mb-10 mt-2 text-navy-600">
        60 minutes, 1:1. {POLICY_COPY.release} {POLICY_COPY.freeCancel}
      </p>

      {balance < 1 && students.every((s) => !s.hasFirstSession) && (
        <p className="mb-8 rounded-lg border border-navy-200 bg-white px-4 py-3 text-sm text-navy-800">
          You have no credits left.{" "}
          <Link href="/credits" className="font-semibold underline">
            Buy a pack
          </Link>{" "}
          to book.
        </p>
      )}

      <BookingForm
        slots={slots}
        students={students}
        balance={balance}
        initialStudentId={params.student}
      />
    </main>
  );
}
