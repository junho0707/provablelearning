'use client';

import { useState, useCallback, useEffect } from 'react';
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
  initialSessions: AlternateSession[];
  initialWeekStart: string;
  initialWeekEnd: string;
  windowStart: string;
  windowEnd?: string;
  basePath: string;
  cancelledContext?: CancelledContext;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(weekEnd + 'T00:00:00');
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startStr} – ${endStr}`;
}

export function AlternateSessionPicker({
  cancellationId,
  initialSessions,
  initialWeekStart,
  initialWeekEnd,
  windowStart,
  windowEnd,
  basePath,
  cancelledContext,
}: Props) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  const [sessions, setSessions] = useState<AlternateSession[]>(initialSessions);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [weekEnd, setWeekEnd] = useState(initialWeekEnd);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pendingBook, setPendingBook] = useState<AlternateSession | null>(null);
  const [pendingWaitlist, setPendingWaitlist] = useState<AlternateSession | null>(null);
  const [booked, setBooked] = useState<{
    bookingId: string;
    day: string;
    time: string;
    date: string;
    googleMeetLink: string | null;
  } | null>(null);
  const [waitlisted, setWaitlisted] = useState<{
    day: string;
    time: string;
    date: string;
  } | null>(null);

  const fetchWeek = useCallback(async (offset: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/cancellations/alternate-sessions?cancellation_id=${cancellationId}&week_offset=${offset}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load sessions.');
        setLoading(false);
        return;
      }
      setSessions(data.sessions || []);
      setWeekStart(data.weekStart || '');
      setWeekEnd(data.weekEnd || '');
    } catch {
      setError('Failed to load sessions.');
    }
    setLoading(false);
  }, [cancellationId]);

  // Check navigation bounds
  const canGoPrev = (() => {
    // Can go back if prev week has at least one future day
    const prevWeekEnd = new Date(weekStart + 'T00:00:00');
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return prevWeekEnd >= today;
  })();

  const canGoNext = (() => {
    if (!windowEnd) return true; // no end date constraint
    const nextWeekStart = new Date(weekEnd + 'T00:00:00');
    nextWeekStart.setDate(nextWeekStart.getDate() + 1);
    return nextWeekStart.toISOString().split('T')[0] <= windowEnd;
  })();

  function handlePrev() {
    if (!canGoPrev) return;
    const newOffset = weekOffset - 1;
    setWeekOffset(newOffset);
    fetchWeek(newOffset);
  }

  function handleNext() {
    if (!canGoNext) return;
    const newOffset = weekOffset + 1;
    setWeekOffset(newOffset);
    fetchWeek(newOffset);
  }

  async function confirmBook() {
    if (!pendingBook) return;
    const session = pendingBook;
    setSubmitting(true);
    setError('');

    const result = await bookMakeupSession(cancellationId, session.classId, session.sessionDate);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      setPendingBook(null);
      return;
    }

    setBooked({
      bookingId: result.bookingId!,
      day: session.meetingDay,
      time: session.meetingTime,
      date: session.sessionDate,
      googleMeetLink: session.googleMeetLink,
    });
    setPendingBook(null);
    setSubmitting(false);
  }

  async function confirmWaitlist() {
    if (!pendingWaitlist) return;
    const session = pendingWaitlist;
    setSubmitting(true);
    setError('');

    const result = await joinMakeupWaitlist(cancellationId, session.classId, session.sessionDate);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      setPendingWaitlist(null);
      return;
    }

    setWaitlisted({
      day: session.meetingDay,
      time: session.meetingTime,
      date: session.sessionDate,
    });
    setPendingWaitlist(null);
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
      <div className="border border-slate-200 rounded-xl p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-xl font-semibold text-navy-900 mb-2">Makeup Booked</h2>
          {cancelledContext && (
            <div className="mb-3 bg-slate-50 rounded p-3 text-sm">
              <p className="text-slate-500">Cancelled: {cancelledContext.courseName} — Session {cancelledContext.sessionNumber} on {cancelledContext.sessionDate}</p>
            </div>
          )}
          <p className="text-slate-600 font-medium">
            Making up: {booked.day}, {booked.date} at {formatTime(booked.time)}
          </p>
          {error && (
            <div className="bg-error-light border border-red-200 text-red-700 text-sm rounded p-3 mt-3">
              {error}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 items-center">
            <button
              onClick={handleCancelMakeup}
              disabled={submitting}
              className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-error-light disabled:opacity-50"
            >
              {submitting ? 'Cancelling...' : 'Cancel Makeup'}
            </button>
            <button
              onClick={() => router.push(basePath)}
              className="rounded border px-4 py-2 text-sm font-medium hover:bg-navy-50"
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
      <div className="border border-slate-200 rounded-xl p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">&#9203;</div>
          <h2 className="text-xl font-semibold text-navy-900 mb-2">Added to Waitlist</h2>
          {cancelledContext && (
            <div className="mb-3 bg-slate-50 rounded p-3 text-sm">
              <p className="text-slate-500">Cancelled: {cancelledContext.courseName} — Session {cancelledContext.sessionNumber} on {cancelledContext.sessionDate}</p>
            </div>
          )}
          <p className="text-slate-600">
            You&apos;ve been added to the waitlist for {waitlisted.day}, {waitlisted.date} at{' '}
            {formatTime(waitlisted.time)}. You&apos;ll be notified if a spot opens up.
          </p>
          <button
            onClick={() => router.push(basePath)}
            className="mt-4 rounded border px-4 py-2 text-sm font-medium hover:bg-navy-50"
          >
            Back to Cancellations
          </button>
        </div>
      </div>
    );
  }

  // Is the current week the cancelled session's week?
  const isCancelledWeek = weekOffset === 0;
  const cancelledDay = isCancelledWeek ? cancelledContext?.meetingDay : undefined;

  const hasAnySessions = sessions.length > 0;

  // Build calendar grid: group by day, collect unique times
  const sessionsByDay: Record<string, AlternateSession[]> = {};
  for (const s of sessions) {
    (sessionsByDay[s.meetingDay] ??= []).push(s);
  }

  // Include the cancelled session's day for context (only on cancelled week)
  const activeDays = WEEKDAYS.filter(
    (d) => sessionsByDay[d]?.length || d === cancelledDay
  );

  // Get unique sorted times across all sessions
  const allTimes = [...new Set(sessions.map((s) => s.meetingTime))];
  if (isCancelledWeek && cancelledContext?.meetingTime && !allTimes.includes(cancelledContext.meetingTime)) {
    allTimes.push(cancelledContext.meetingTime);
  }
  allTimes.sort();

  // Get the date for each day column from available sessions
  const dayDates: Record<string, string> = {};
  for (const s of sessions) {
    if (!dayDates[s.meetingDay]) dayDates[s.meetingDay] = s.sessionDate;
  }
  if (isCancelledWeek && cancelledContext && cancelledDay) {
    dayDates[cancelledDay] = cancelledContext.sessionDate;
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.push(basePath)}
        className="text-sm text-slate-500 hover:text-navy-900 font-medium"
      >
        &larr; Back to Cancellations
      </button>

      {error && (
        <div className="bg-error-light border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
        <button
          onClick={handlePrev}
          disabled={!canGoPrev || loading}
          className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous week"
        >
          <span className="text-lg">&larr;</span>
        </button>
        <div className="text-center">
          <span className="font-semibold text-navy-900">
            {formatWeekRange(weekStart, weekEnd)}
          </span>
          {isCancelledWeek && (
            <span className="ml-2 text-xs text-red-600 font-medium">(cancelled week)</span>
          )}
        </div>
        <button
          onClick={handleNext}
          disabled={!canGoNext || loading}
          className="rounded p-1.5 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next week"
        >
          <span className="text-lg">&rarr;</span>
        </button>
      </div>

      {loading ? (
        <div className="text-slate-500 py-8 text-center">Loading sessions...</div>
      ) : !hasAnySessions && activeDays.length === 0 ? (
        <div className="border border-slate-200 rounded-xl p-6 text-center">
          <p className="text-slate-500">No alternate sessions available this week.</p>
          <p className="text-xs text-slate-400 mt-1">Try browsing other weeks using the arrows above.</p>
        </div>
      ) : (
        <>
          {/* Desktop: week calendar grid */}
          <div className="hidden md:block overflow-x-auto">
            <div
              className="grid gap-px bg-slate-200 rounded-xl overflow-hidden"
              style={{ gridTemplateColumns: `64px repeat(${activeDays.length}, minmax(100px, 1fr))` }}
            >
              {/* Header row */}
              <div className="bg-slate-50 p-2" />
              {activeDays.map((day) => (
                <div
                  key={day}
                  className={`p-2 text-center text-sm font-semibold ${
                    day === cancelledDay ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-navy-900'
                  }`}
                >
                  <div>{day.slice(0, 3)}</div>
                  {dayDates[day] && (
                    <div className="text-xs font-normal text-slate-400">{formatDateShort(dayDates[day])}</div>
                  )}
                </div>
              ))}

              {/* Time rows */}
              {allTimes.map((time) => (
                <>
                  {/* Time label */}
                  <div
                    key={`time-${time}`}
                    className="bg-white p-2 flex items-center justify-center text-xs font-medium text-slate-500"
                  >
                    {formatTime(time)}
                  </div>

                  {/* Day cells for this time */}
                  {activeDays.map((day) => {
                    const isCancelled =
                      day === cancelledDay && time === cancelledContext?.meetingTime;
                    const session = sessionsByDay[day]?.find((s) => s.meetingTime === time);

                    if (isCancelled && !session) {
                      return (
                        <div
                          key={`${day}-${time}`}
                          className="bg-red-50 p-2 flex flex-col items-center justify-center gap-1"
                        >
                          <span className="text-xs font-medium text-red-600">Cancelled</span>
                          <span className="text-[10px] text-red-400">
                            Session {cancelledContext!.sessionNumber}
                          </span>
                        </div>
                      );
                    }

                    if (!session) {
                      return <div key={`${day}-${time}`} className="bg-white p-2" />;
                    }

                    if (session.isPast) {
                      return (
                        <div
                          key={`${day}-${time}`}
                          className="p-2 flex flex-col items-center justify-center gap-1.5 bg-slate-100"
                        >
                          <span className="text-[10px] font-medium text-slate-400">Passed</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${day}-${time}`}
                        className={`p-2 flex flex-col items-center justify-center gap-1.5 ${
                          session.isFull ? 'bg-amber-50' : 'bg-green-50'
                        }`}
                      >
                        <span
                          className={`text-[10px] font-medium ${
                            session.isFull ? 'text-amber-600' : 'text-green-700'
                          }`}
                        >
                          {session.isFull
                            ? 'Full'
                            : `${session.availableSeats} seat${session.availableSeats !== 1 ? 's' : ''}`}
                        </span>
                        {session.isFull ? (
                          <button
                            onClick={() => setPendingWaitlist(session)}
                            disabled={submitting}
                            className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            Waitlist
                          </button>
                        ) : (
                          <button
                            onClick={() => setPendingBook(session)}
                            disabled={submitting}
                            className="rounded bg-navy-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-navy-800 disabled:opacity-50 whitespace-nowrap"
                          >
                            Book
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>

          {/* Mobile: stacked by day */}
          <div className="md:hidden space-y-4">
            {activeDays.map((day) => {
              const isCancelledDay = day === cancelledDay;
              const daySessions = sessionsByDay[day] || [];
              const cancelledTime = cancelledContext?.meetingTime;
              const showCancelledPlaceholder = isCancelledDay && cancelledTime && !daySessions.some((s) => s.meetingTime === cancelledTime);

              return (
                <div key={day}>
                  <h3 className={`font-semibold text-sm mb-2 ${isCancelledDay ? 'text-red-700' : 'text-navy-900'}`}>
                    {day}
                    {dayDates[day] && (
                      <span className="font-normal text-slate-400 ml-1.5">{formatDateShort(dayDates[day])}</span>
                    )}
                  </h3>
                  <div className="space-y-1.5">
                    {showCancelledPlaceholder && (
                      <div className="w-full rounded border border-red-200 bg-red-50 p-3 text-sm">
                        <span className="font-medium text-red-600">
                          {formatTime(cancelledTime)} — Cancelled
                        </span>
                        <span className="text-red-400 text-xs ml-2">Session {cancelledContext!.sessionNumber}</span>
                      </div>
                    )}
                    {daySessions
                      .sort((a, b) => a.meetingTime.localeCompare(b.meetingTime))
                      .map((session) =>
                        session.isPast ? (
                          <div
                            key={`${session.classId}-${session.meetingDay}-m`}
                            className="w-full rounded border border-slate-200 bg-slate-100 p-3 text-sm"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-medium text-slate-400">{formatTime(session.meetingTime)}</span>
                              <span className="text-xs font-medium text-slate-400">Passed</span>
                            </div>
                          </div>
                        ) : (
                          <button
                            key={`${session.classId}-${session.meetingDay}-m`}
                            onClick={() => session.isFull ? setPendingWaitlist(session) : setPendingBook(session)}
                            disabled={submitting}
                            className={`w-full text-left rounded border p-3 text-sm transition-colors ${
                              session.isFull
                                ? 'bg-amber-50 border-amber-200'
                                : 'bg-green-50 border-green-200 hover:bg-green-100'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-medium">{formatTime(session.meetingTime)}</span>
                              <span className="flex items-center gap-2">
                                <span className={`text-xs font-medium ${session.isFull ? 'text-amber-600' : 'text-green-700'}`}>
                                  {session.isFull
                                    ? 'Full'
                                    : `${session.availableSeats} seat${session.availableSeats !== 1 ? 's' : ''}`}
                                </span>
                                <span className={`rounded px-2 py-0.5 text-xs font-medium text-white ${
                                  session.isFull ? 'bg-amber-600' : 'bg-navy-900'
                                }`}>
                                  {session.isFull ? 'Waitlist' : 'Book'}
                                </span>
                              </span>
                            </div>
                          </button>
                        )
                      )}
                    {daySessions.length === 0 && !showCancelledPlaceholder && (
                      <p className="text-xs text-slate-400 pl-1">No sessions</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Confirmation dialog */}
      {(pendingBook || pendingWaitlist) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm mx-4 space-y-4">
            <h3 className="text-lg font-semibold text-navy-900">
              {pendingBook ? 'Confirm Makeup Booking' : 'Confirm Waitlist'}
            </h3>
            <p className="text-sm text-slate-600">
              {pendingBook
                ? `Book makeup session on ${pendingBook.meetingDay}, ${formatDateShort(pendingBook.sessionDate)} at ${formatTime(pendingBook.meetingTime)}?`
                : `Join waitlist for ${pendingWaitlist!.meetingDay}, ${formatDateShort(pendingWaitlist!.sessionDate)} at ${formatTime(pendingWaitlist!.meetingTime)}?`}
            </p>
            {error && (
              <div className="bg-error-light border border-red-200 text-red-700 text-sm rounded p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setPendingBook(null); setPendingWaitlist(null); setError(''); }}
                disabled={submitting}
                className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={pendingBook ? confirmBook : confirmWaitlist}
                disabled={submitting}
                className={`rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  pendingBook
                    ? 'bg-navy-900 hover:bg-navy-800'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {submitting ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
