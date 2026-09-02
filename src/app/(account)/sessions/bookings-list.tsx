"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelBooking, requestCreditReturn } from "@/lib/booking/manage";
import type { MyBooking } from "@/lib/booking/history";

const STATUS_LABEL: Record<MyBooking["status"], string> = {
  booked: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

/** TASK-BOOK-004. Upcoming/past sessions, cancel, and the no-show credit-return request. */
export function BookingsList({ bookings }: { bookings: MyBooking[] }) {
  const now = Date.now();
  const upcoming = bookings.filter((b) => b.status === "booked" && new Date(b.startsAt).getTime() >= now);
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-navy-400">
          Upcoming
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-navy-500">No upcoming sessions.</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-navy-400">Past</h3>
          <ul className="space-y-3">
            {past.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BookingRow({ booking }: { booking: MyBooking }) {
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
    <li className="rounded-xl border border-navy-100 bg-white p-5 text-sm shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-navy-900">{new Date(booking.startsAt).toLocaleString()}</p>
          <p className="text-navy-500">
            {booking.profileName} · {STATUS_LABEL[booking.status]}
          </p>
        </div>
        {booking.status === "booked" && booking.meetUrl && (
          <a href={booking.meetUrl} className="text-sm font-semibold text-navy-700 underline">
            Join
          </a>
        )}
      </div>

      {canCancel && (
        <button onClick={cancel} disabled={pending} className="mt-2 text-sm font-semibold text-error underline disabled:opacity-40">
          Cancel
        </button>
      )}

      {booking.canRequestReturn && !returnRequested && !reasonOpen && (
        <button onClick={() => setReasonOpen(true)} className="mt-2 text-sm font-semibold text-navy-700 underline">
          Request credit back
        </button>
      )}

      {reasonOpen && !returnRequested && (
        <div className="mt-2">
          <label htmlFor={`reason-${booking.id}`} className="block text-navy-700">
            What happened? The tutor reviews each request.
          </label>
          <textarea
            id={`reason-${booking.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-lg border border-navy-200 px-3 py-2 text-sm outline-none focus:border-navy-400"
          />
          <button
            onClick={requestReturn}
            disabled={pending || !reason.trim()}
            className="mt-1 text-sm font-semibold text-navy-700 underline disabled:opacity-40"
          >
            {pending ? "Sending…" : "Send request"}
          </button>
        </div>
      )}

      {(returnRequested || booking.returnRequestStatus === "pending") && (
        <p className="mt-2 text-navy-500">Request sent — the tutor will review it.</p>
      )}
      {booking.returnRequestStatus === "approved" && (
        <p className="mt-2 text-navy-500">Credit returned.</p>
      )}
      {booking.returnRequestStatus === "denied" && !returnRequested && (
        <p className="mt-2 text-navy-500">Request reviewed — the credit wasn&apos;t returned.</p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-error">
          {error}
        </p>
      )}
    </li>
  );
}

