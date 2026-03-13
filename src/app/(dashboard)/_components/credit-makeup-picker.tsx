'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { redeemCreditForMakeup } from '@/lib/credits/redeem-credit';
import { formatTime } from '@/lib/constants';
import { cancelMakeupBooking } from '@/lib/cancellation/cancel-makeup';
import { MonthCalendar } from '@/app/book/month-calendar';
import type { CreditMakeupSlot } from '@/lib/credits/find-sessions-for-credit';

interface Props {
  studentId: string;
  sessions: CreditMakeupSlot[];
  basePath: string;
}

export function CreditMakeupPicker({ studentId, sessions, basePath }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [booked, setBooked] = useState<{
    bookingId: string;
    className: string | null;
    meetingDay: string;
    meetingTime: string;
    sessionDate: string;
  } | null>(null);

  const now = new Date();
  const [viewMonth, setViewMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });

  // Build availableDates map: date string -> number of time slots
  const availableDates = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sessions) {
      if (!s.isFull) {
        map[s.sessionDate] = (map[s.sessionDate] || 0) + 1;
      }
    }
    return map;
  }, [sessions]);

  // Sessions for the selected date
  const sessionsForDate = useMemo(() => {
    if (!selectedDate) return [];
    return sessions.filter((s) => s.sessionDate === selectedDate && !s.isFull);
  }, [sessions, selectedDate]);

  function handleMonthChange(dir: 'prev' | 'next') {
    setViewMonth((prev) => {
      const d = new Date(prev.year, prev.month + (dir === 'next' ? 1 : -1), 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }

  async function handleBook(session: CreditMakeupSlot) {
    setSubmitting(true);
    setError('');

    const result = await redeemCreditForMakeup(studentId, session.classId, session.sessionDate);

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setBooked({
      bookingId: result.bookingId!,
      className: session.className,
      meetingDay: session.meetingDay,
      meetingTime: session.meetingTime,
      sessionDate: session.sessionDate,
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
      <div className="border border-slate-200 rounded-xl p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-xl font-semibold text-navy-900 mb-2">Makeup Booked with Credit</h2>
          <p className="text-slate-600 font-medium">
            {booked.className ? `${booked.className} — ` : ''}
            {formatDate(booked.sessionDate)} at {formatTime(booked.meetingTime)}
          </p>
          <p className="text-sm text-green-600 mt-2">1 credit has been used.</p>
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
              {submitting ? 'Cancelling...' : 'Cancel Makeup (restore credit)'}
            </button>
            <button
              onClick={() => router.push(basePath)}
              className="rounded border px-4 py-2 text-sm font-medium hover:bg-navy-50"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="border border-slate-200 rounded-xl p-6 text-center">
        <p className="text-slate-500">No matching makeup sessions available right now. Check back later.</p>
        <button
          onClick={() => router.push(basePath)}
          className="mt-4 rounded border px-4 py-2 text-sm font-medium hover:bg-navy-50"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm text-purple-800">
        1 credit will be used to book a makeup session. Pick a date on the calendar.
      </div>

      {error && (
        <div className="bg-error-light border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      <div className="border border-slate-200 rounded-xl p-4">
        <MonthCalendar
          availableDates={availableDates}
          viewMonth={viewMonth}
          onMonthChange={handleMonthChange}
          onSelectDate={(dateStr) => setSelectedDate(dateStr)}
        />
      </div>

      {selectedDate && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-gray-700">
            Sessions on {formatDate(selectedDate)}
          </h3>
          {sessionsForDate.length === 0 ? (
            <p className="text-sm text-slate-500">No available sessions on this date.</p>
          ) : (
            sessionsForDate.map((session) => (
              <div
                key={`${session.classId}-${session.sessionDate}`}
                className="border border-slate-200 rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  {session.className && (
                    <p className="font-medium">{session.className}</p>
                  )}
                  <p className="text-sm text-slate-600">
                    {formatTime(session.meetingTime)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {session.availableSeats} seat{session.availableSeats !== 1 ? 's' : ''} available
                  </p>
                </div>
                <button
                  onClick={() => handleBook(session)}
                  disabled={submitting}
                  className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {submitting ? 'Booking...' : 'Use Credit'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <button
        onClick={() => router.push(basePath)}
        className="rounded border px-4 py-2 text-sm font-medium hover:bg-navy-50"
      >
        Back to Dashboard
      </button>
    </div>
  );
}
