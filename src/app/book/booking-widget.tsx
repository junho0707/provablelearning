'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MonthCalendar } from './month-calendar';

interface SlotsByDate {
  [date: string]: string[];
}

export function BookingWidget({
  studentName,
  className,
  bookingType = 'initial',
}: {
  studentName?: string;
  className?: string;
  bookingType?: 'initial' | 'refund';
}) {
  const [step, setStep] = useState<'date' | 'time' | 'info' | 'done' | 'already_booked' | 'closed'>('date');
  const [loading, setLoading] = useState(true);
  const [slotsByDate, setSlotsByDate] = useState<SlotsByDate>({});
  const [windowEnd, setWindowEnd] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactMethod, setContactMethod] = useState<'email' | 'sms' | 'both'>('email');
  const [meetingType, setMeetingType] = useState<'meet' | 'phone'>('meet');
  const [submitting, setSubmitting] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [error, setError] = useState('');
  const [existingBooking, setExistingBooking] = useState<{
    datetime: string;
    status: string;
  } | null>(null);
  const [dashboardPath, setDashboardPath] = useState<string | null>(null);

  // Pre-fill form for logged-in users + check existing booking
  useEffect(() => {
    async function prefill() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('users')
        .select('full_name, phone, role')
        .eq('id', user.id)
        .single();

      if (profile) {
        if (profile.full_name) setName(profile.full_name);
        if (profile.phone) setPhone(profile.phone);
        if (profile.role) setDashboardPath(`/${profile.role}`);
      }
      if (user.email) setEmail(user.email);

      // Check if user already has a confirmed booking of the same type
      const { data: booking } = await supabase
        .from('bookings')
        .select('datetime, status')
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .eq('booking_type', bookingType)
        .gte('datetime', new Date().toISOString())
        .order('datetime', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (booking) {
        const bookingTime = new Date(booking.datetime);
        // Only block if booking is in the future
        if (bookingTime > new Date()) {
          setExistingBooking(booking);
          setStep('already_booked');
        }
      }
    }

    prefill();
  }, []);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/available-slots');
      const data = await res.json();

      // API error — show error, not "closed"
      if (!res.ok) {
        setError(data.error || 'Failed to load available times.');
        setLoading(false);
        return;
      }

      // If no window is set, bookings are closed
      if (!data.windowStart || !data.windowEnd) {
        setStep('closed');
        setLoading(false);
        return;
      }

      setWindowEnd(data.windowEnd);

      if (data.slots) {
        // Group by date
        const grouped: SlotsByDate = {};
        for (const iso of data.slots as string[]) {
          const date = iso.split('T')[0];
          if (!grouped[date]) grouped[date] = [];
          grouped[date].push(iso);
        }
        setSlotsByDate(grouped);
      }
    } catch {
      setError('Failed to load available times.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchSlots();
     
  }, [fetchSlots]);

  const dates = Object.keys(slotsByDate).sort();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const needsPhone = meetingType === 'phone' || contactMethod === 'sms' || contactMethod === 'both';
    if (!selectedSlot || !name.trim() || !email.trim() || (needsPhone && !phone.trim())) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentName: name.trim(),
          parentEmail: email.trim(),
          parentPhone: phone.trim(),
          dateTime: selectedSlot,
          contactMethod,
          meetingType,
          ...(studentName ? { studentName } : {}),
          ...(className ? { className } : {}),
          bookingType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Booking failed.');
      } else {
        setStep('done');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  if (loading && step !== 'already_booked' && step !== 'closed') {
    return <div className="text-slate-400 py-8">Loading available times...</div>;
  }

  if (step === 'closed') {
    return (
      <div className="text-center py-12 rounded-2xl border border-slate-200/80">
        <h2 className="text-xl font-semibold text-navy-900 mb-2">Bookings Are Currently Closed</h2>
        <p className="text-slate-500">
          Consultation slots are not available right now. Please check back later.
        </p>
      </div>
    );
  }

  // Already has an active booking
  if (step === 'already_booked' && existingBooking) {
    const dt = new Date(existingBooking.datetime);
    return (
      <div className="text-center py-12 rounded-2xl border border-slate-200/80">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-navy-50">
          <svg className="h-7 w-7 text-navy-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-navy-900 mb-2">You Already Have a Booking</h2>
        <p className="text-slate-600 mb-1">
          Your consultation is scheduled for{' '}
          {dt.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}{' '}
          at{' '}
          {dt.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
        <p className="text-sm text-slate-400 mt-2">
          Check your email for the calendar invite with the meeting link.
        </p>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="text-center py-12 rounded-2xl border border-slate-200/80">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-light">
          <svg className="h-7 w-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-navy-900 mb-2">Booking Confirmed!</h2>
        <p className="text-slate-600 mb-1">
          {new Date(selectedSlot).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}{' '}
          at{' '}
          {new Date(selectedSlot).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
        <p className="text-sm text-slate-400 mt-2">
          A confirmation has been sent to <span className="font-medium text-slate-600">{email}</span>.
        </p>
        <p className="text-sm text-slate-400 mt-1">
          {meetingType === 'meet'
            ? 'A Google Meet link is included in the calendar invite.'
            : 'Your tutor will call you at the scheduled time.'}
        </p>
        <p className="text-sm text-slate-400 mt-1">
          {contactMethod === 'email' && 'You will receive a reminder via email before your meeting.'}
          {contactMethod === 'sms' && 'You will receive a reminder via text message before your meeting.'}
          {contactMethod === 'both' && 'You will receive a reminder via email and text before your meeting.'}
        </p>
        {dashboardPath && (
          <a
            href={dashboardPath}
            className="inline-block mt-6 rounded-xl bg-navy-900 px-6 py-2.5 text-white text-sm font-semibold hover:bg-navy-800"
          >
            Go to Dashboard
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {studentName && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Refund consultation</span> for{' '}
            <span className="font-medium">{studentName}</span>
            {className && (
              <>
                {' '}&mdash; <span className="font-medium">{className}</span>
              </>
            )}
          </p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4">
          {error}
        </div>
      )}

      {/* Step 1: Pick a date */}
      {step === 'date' && (
        <div>
          <h2 className="font-semibold mb-4">Select a Date</h2>
          {dates.length === 0 ? (
            <p className="text-gray-500">No available times in the current booking window.</p>
          ) : (
            <MonthCalendar
              availableDates={Object.fromEntries(
                dates.map((d) => [d, slotsByDate[d].length])
              )}
              windowEnd={windowEnd}
              viewMonth={viewMonth}
              onMonthChange={(dir) => {
                setViewMonth((prev) => {
                  if (dir === 'prev') {
                    return prev.month === 0
                      ? { year: prev.year - 1, month: 11 }
                      : { year: prev.year, month: prev.month - 1 };
                  }
                  return prev.month === 11
                    ? { year: prev.year + 1, month: 0 }
                    : { year: prev.year, month: prev.month + 1 };
                });
              }}
              onSelectDate={(dateStr) => {
                setSelectedDate(dateStr);
                setStep('time');
              }}
            />
          )}
        </div>
      )}

      {/* Step 2: Pick a time */}
      {step === 'time' && (
        <div>
          <button
            onClick={() => setStep('date')}
            className="text-sm text-navy-400 hover:text-navy-900 mb-4"
          >
            &larr; Back to dates
          </button>
          <h2 className="font-semibold mb-4">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {(slotsByDate[selectedDate] || []).map((slot) => (
              <button
                key={slot}
                onClick={() => {
                  setSelectedSlot(slot);
                  setStep('info');
                }}
                className="rounded-lg border border-slate-200 p-2 text-sm font-medium text-navy-900 hover:bg-navy-900 hover:text-white hover:border-navy-900 transition-colors"
              >
                {new Date(slot).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Contact info */}
      {step === 'info' && (
        <div>
          <button
            onClick={() => setStep('time')}
            className="text-sm text-navy-400 hover:text-navy-900 mb-4"
          >
            &larr; Back to times
          </button>
          <h2 className="font-semibold mb-1">Your Details</h2>
          <p className="text-sm text-gray-500 mb-4">
            {new Date(selectedSlot).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}{' '}
            at{' '}
            {new Date(selectedSlot).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
            {' '}(30 min)
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="you@email.com"
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">How would you like to meet?</legend>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="meetingType"
                    value="meet"
                    checked={meetingType === 'meet'}
                    onChange={() => setMeetingType('meet')}
                  />
                  Google Meet
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="meetingType"
                    value="phone"
                    checked={meetingType === 'phone'}
                    onChange={() => setMeetingType('phone')}
                  />
                  Phone Call
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">How would you like to receive your reminder?</legend>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="contactMethod"
                    value="email"
                    checked={contactMethod === 'email'}
                    onChange={() => setContactMethod('email')}
                  />
                  Email
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="contactMethod"
                    value="sms"
                    checked={contactMethod === 'sms'}
                    onChange={() => setContactMethod('sms')}
                  />
                  Text Message
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="contactMethod"
                    value="both"
                    checked={contactMethod === 'both'}
                    onChange={() => setContactMethod('both')}
                  />
                  Both
                </label>
              </div>
            </fieldset>

            {(meetingType === 'phone' || contactMethod === 'sms' || contactMethod === 'both') && (
              <div>
                <label className="block text-sm font-medium mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="(555) 123-4567"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-navy-900 px-4 py-3 text-white font-semibold hover:bg-navy-800 disabled:opacity-50"
            >
              {submitting ? 'Booking...' : 'Confirm Booking'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
