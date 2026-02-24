'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { bookMakeupSession } from '@/lib/cancellation/book-makeup';
import { cancelMakeupBooking } from '@/lib/cancellation/cancel-makeup';
import { joinMakeupWaitlist } from '@/lib/cancellation/join-makeup-waitlist';
import type { AlternateSession } from '@/lib/cancellation/find-alternate-sessions';

export interface CancelledContext {
  studentName: string;
  courseName: string;
  sessionNumber: number;
  sessionDate: string;
  meetingDay: string;
  meetingTime: string;
}

interface Props {
  cancellationId: string;
  alternateSessions: AlternateSession[];
  basePath: string;
  cancelledContext?: CancelledContext;
}

export function AlternateSessionPicker({
  cancellationId,
  alternateSessions,
  basePath,
  cancelledContext,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [booked, setBooked] = useState<{
    bookingId: string;
    day: string;
    time: string;
    date: string;
  } | null>(null);
  const [waitlisted, setWaitlisted] = useState<{
    day: string;
    time: string;
    date: string;
  } | null>(null);

  async function handleBook(session: AlternateSession) {
    setSubmitting(true);
    setError('');

    const result = await bookMakeupSession(cancellationId, session.classId);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setBooked({
      bookingId: result.bookingId!,
      day: session.meetingDay,
      time: session.meetingTime,
      date: session.sessionDate,
    });
    setSubmitting(false);
  }

  async function handleJoinWaitlist(session: AlternateSession) {
    setSubmitting(true);
    setError('');

    const result = await joinMakeupWaitlist(cancellationId, session.classId);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setWaitlisted({
      day: session.meetingDay,
      time: session.meetingTime,
      date: session.sessionDate,
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

    // Go back to the cancel-session page
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
            Making up: {booked.day}, {booked.date} at {booked.time}
          </p>
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
            You&apos;ve been added to the waitlist for {waitlisted.day}, {waitlisted.date} at{' '}
            {waitlisted.time}. You&apos;ll be notified if a spot opens up.
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

  const hasAnySessions = alternateSessions.length > 0;

  if (!hasAnySessions) {
    return (
      <div className="border rounded-lg p-6 text-center">
        <p className="text-gray-500">No alternate sessions available this week.</p>
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
        {alternateSessions.map((session) => (
          <div
            key={session.classId}
            className="border rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <p className="font-medium">
                {session.meetingDay} at {session.meetingTime}
              </p>
              <p className="text-sm text-gray-500">
                Session date: {session.sessionDate}
              </p>
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
