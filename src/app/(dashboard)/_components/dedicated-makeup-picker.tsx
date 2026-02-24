'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { bookDedicatedMakeup } from '@/lib/cancellation/book-dedicated-makeup';
import { cancelMakeupBooking } from '@/lib/cancellation/cancel-makeup';
import { joinDedicatedMakeupWaitlist } from '@/lib/cancellation/join-dedicated-makeup-waitlist';
import type { DedicatedMakeupSession } from '@/lib/cancellation/find-dedicated-makeups';
import type { CancelledContext } from './alternate-session-picker';

interface Props {
  cancellationId: string;
  sessions: DedicatedMakeupSession[];
  basePath: string;
  cancelledContext?: CancelledContext;
}

export function DedicatedMakeupPicker({
  cancellationId,
  sessions,
  basePath,
  cancelledContext,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [booked, setBooked] = useState<{
    bookingId: string;
    date: string;
    time: string;
    location: string | null;
  } | null>(null);
  const [waitlisted, setWaitlisted] = useState<{
    date: string;
    time: string;
  } | null>(null);

  async function handleBook(session: DedicatedMakeupSession) {
    setSubmitting(true);
    setError('');

    const result = await bookDedicatedMakeup(cancellationId, session.id);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setBooked({
      bookingId: result.bookingId!,
      date: session.sessionDate,
      time: session.sessionTime,
      location: session.location,
    });
    setSubmitting(false);
  }

  async function handleJoinWaitlist(session: DedicatedMakeupSession) {
    setSubmitting(true);
    setError('');

    const result = await joinDedicatedMakeupWaitlist(cancellationId, session.id);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setWaitlisted({
      date: session.sessionDate,
      time: session.sessionTime,
    });
    setSubmitting(false);
  }

  async function handleCancelMakeup() {
    if (!booked) return;
    setSubmitting(true);
    setError('');

    const result = await cancelMakeupBooking(booked.bookingId);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    router.push(basePath);
    router.refresh();
  }

  if (booked) {
    return (
      <div className="border rounded-lg p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-xl font-semibold mb-2">Makeup Booked</h2>
          {cancelledContext && (
            <div className="mb-3 bg-gray-50 rounded p-3 text-sm">
              <p className="text-gray-500">Cancelled: {cancelledContext.courseName} — Session {cancelledContext.sessionNumber} on {cancelledContext.sessionDate}</p>
            </div>
          )}
          <p className="text-gray-600 font-medium">
            Makeup session: {booked.date} at {booked.time}
          </p>
          {booked.location && (
            <p className="text-gray-500 text-sm">{booked.location}</p>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mt-3">
              {error}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 items-center">
            <button
              onClick={handleCancelMakeup}
              disabled={submitting}
              className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {submitting ? 'Cancelling...' : 'Cancel Makeup'}
            </button>
            <button
              onClick={() => router.push(basePath)}
              className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Back to Cancellations
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (waitlisted) {
    return (
      <div className="border rounded-lg p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">&#9203;</div>
          <h2 className="text-xl font-semibold mb-2">Added to Waitlist</h2>
          {cancelledContext && (
            <div className="mb-3 bg-gray-50 rounded p-3 text-sm">
              <p className="text-gray-500">Cancelled: {cancelledContext.courseName} — Session {cancelledContext.sessionNumber} on {cancelledContext.sessionDate}</p>
            </div>
          )}
          <p className="text-gray-600">
            You&apos;ve been added to the waitlist for the {waitlisted.date} at {waitlisted.time} makeup session. You&apos;ll be auto-booked if a spot opens up.
          </p>
          <button
            onClick={() => router.push(basePath)}
            className="mt-4 rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Back to Cancellations
          </button>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center">
        <p className="text-gray-500">No makeup sessions available. Check back later or a credit will be issued at the deadline.</p>
        <button
          onClick={() => router.push(basePath)}
          className="mt-4 rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back to Cancellations
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="border rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <p className="font-medium">
                {session.sessionDate} at {session.sessionTime}
              </p>
              {session.location && (
                <p className="text-sm text-gray-500">{session.location}</p>
              )}
              {session.isFull ? (
                <p className="text-sm text-amber-600 font-medium">Session full</p>
              ) : (
                <p className="text-sm text-gray-500">
                  {session.availableSeats} seat{session.availableSeats !== 1 ? 's' : ''} available
                </p>
              )}
            </div>
            {session.isFull ? (
              <button
                onClick={() => handleJoinWaitlist(session)}
                disabled={submitting}
                className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {submitting ? 'Joining...' : 'Join Waitlist'}
              </button>
            ) : (
              <button
                onClick={() => handleBook(session)}
                disabled={submitting}
                className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {submitting ? 'Booking...' : 'Book This Session'}
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push(basePath)}
        className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
      >
        Back to Cancellations
      </button>
    </div>
  );
}
