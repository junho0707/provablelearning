"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelBooking, requestCreditReturn } from "@/lib/booking/manage";
import type { MyBooking } from "@/lib/booking/history";
import { sessionTime } from "@/lib/time-format";
import { BTN_QUIET, EYEBROW, INPUT, LABEL } from "@/lib/ui";

const STATUS_LABEL: Record<MyBooking["status"], string> = {
  booked: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

/** Upcoming and past sessions, cancelling, and asking for a burned credit back (F9, F10). */
export function BookingsList({ bookings, timeZone }: { bookings: MyBooking[]; timeZone: string }) {
  const now = Date.now();
  const upcoming = bookings.filter((b) => b.status === "booked" && new Date(b.startsAt).getTime() >= now);
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <section>
        <h3 className={`mb-4 ${EYEBROW}`}>Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="text-[0.875rem] text-navy-950/45">No upcoming sessions.</p>
        ) : (
          <ul className="border-t border-navy-950/10">
            {upcoming.map((b) => (
              <BookingRow key={b.id} booking={b} timeZone={timeZone} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h3 className={`mb-4 ${EYEBROW}`}>Past</h3>
          <ul className="border-t border-navy-950/10">
            {past.map((b) => (
              <BookingRow key={b.id} booking={b} timeZone={timeZone} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BookingRow({ booking, timeZone }: { booking: MyBooking; timeZone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [returnRequested, setReturnRequested] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");

  const canCancel = booking.status === "booked" && new Date(booking.startsAt).getTime() >= Date.now();

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking({ bookingId: booking.id });
      if (!result.ok) return setError(result.message);
      router.refresh();
    });
  }

  function requestReturn() {
    setError(null);
    startTransition(async () => {
      const result = await requestCreditReturn({ bookingId: booking.id, reason: reason.trim() });
      if (!result.ok) return setError(result.message);
      setReturnRequested(true);
    });
  }

  return (
    <li className="border-b border-navy-950/10 py-5 text-[0.9375rem]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-navy-950">{sessionTime(booking.startsAt, timeZone)}</p>
          <p className="mt-0.5 text-[0.875rem] text-navy-950/55">
            {booking.profileName} · {STATUS_LABEL[booking.status]}
          </p>
        </div>
      </div>

      {canCancel && (
        <button
          onClick={cancel}
          disabled={pending}
          className="mt-3 text-[0.875rem] font-semibold text-[var(--error)] hover:underline disabled:opacity-40"
        >
          Cancel
        </button>
      )}

      {booking.canRequestReturn && !returnRequested && !reasonOpen && (
        <button onClick={() => setReasonOpen(true)} className={`mt-3 ${BTN_QUIET}`}>
          Ask for the credit back
        </button>
      )}

      {/* F10 step 6: past the cap, no request is offered at all and the buyer is told why, rather
          than being allowed to write a note that could never be granted. */}
      {booking.creditBurned && !booking.canRequestReturn && booking.returnRequestStatus === null && (
        <p className="mt-3 text-[0.875rem] leading-relaxed text-navy-950/55">
          This one used the credit. You&apos;ve already had both credit returns for this student this
          month, so it can&apos;t be returned.
        </p>
      )}

      {reasonOpen && !returnRequested && (
        <div className="mt-3">
          <label htmlFor={`reason-${booking.id}`} className={`block ${LABEL}`}>
            What happened? Every request is reviewed.{" "}
            <span className="font-normal text-navy-700">
              {booking.allowanceRemaining === 1
                ? "This is your last credit return for this student this month."
                : `${booking.allowanceRemaining} credit returns left for this student this month.`}
            </span>
          </label>
          <textarea
            id={`reason-${booking.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className={`mt-2 ${INPUT}`}
          />
          <button
            onClick={requestReturn}
            disabled={pending || !reason.trim()}
            className={`mt-2 ${BTN_QUIET}`}
          >
            {pending ? "Sending…" : "Send request"}
          </button>
        </div>
      )}

      {(returnRequested || booking.returnRequestStatus === "pending") && (
        <p className="mt-3 text-[0.875rem] text-navy-950/55">
          Request sent — the tutor will review it.
        </p>
      )}
      {booking.returnRequestStatus === "approved" && (
        <p className="mt-3 text-[0.875rem] text-navy-950/55">Credit returned.</p>
      )}
      {booking.returnRequestStatus === "denied" && !returnRequested && (
        <p className="mt-3 text-[0.875rem] text-navy-950/55">
          Request reviewed — the credit wasn&apos;t returned.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[0.875rem] font-medium text-[var(--error)]">
          {error}
        </p>
      )}
    </li>
  );
}
