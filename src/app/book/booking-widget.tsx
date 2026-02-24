'use client';

import { useState, useEffect, useCallback } from 'react';

interface SlotsByDate {
  [date: string]: string[];
}

export function BookingWidget({
  studentName,
  className,
}: {
  studentName?: string;
  className?: string;
}) {
  const [step, setStep] = useState<'date' | 'time' | 'info' | 'done'>('date');
  const [loading, setLoading] = useState(true);
  const [slotsByDate, setSlotsByDate] = useState<SlotsByDate>({});
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bookings/available-slots');
      const data = await res.json();
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
    fetchSlots();
  }, [fetchSlots]);

  const dates = Object.keys(slotsByDate).sort();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !name.trim() || !email.trim() || !phone.trim()) return;

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
          ...(studentName ? { studentName } : {}),
          ...(className ? { className } : {}),
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

  if (loading) {
    return <div className="text-gray-500 py-8">Loading available times...</div>;
  }

  if (step === 'done') {
    return (
      <div className="text-center py-12 border rounded-lg">
        <div className="text-4xl mb-4">&#10003;</div>
        <h2 className="text-xl font-semibold mb-2">Booking Confirmed!</h2>
        <p className="text-gray-600 mb-1">
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
        <p className="text-sm text-gray-500 mt-2">
          Check your email ({email}) for a calendar invite with the meeting link.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-6">
      {studentName && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Refund consultation</span> for{' '}
            <span className="font-medium">{studentName}</span>
            {className && (
              <>
                {' '}— <span className="font-medium">{className}</span>
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
            <p className="text-gray-500">No available times in the next 2 weeks.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {dates.map((date) => {
                const d = new Date(date + 'T12:00:00');
                return (
                  <button
                    key={date}
                    onClick={() => {
                      setSelectedDate(date);
                      setStep('time');
                    }}
                    className="border rounded p-3 text-left hover:bg-gray-50"
                  >
                    <p className="font-medium text-sm">
                      {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {slotsByDate[date].length} slot{slotsByDate[date].length === 1 ? '' : 's'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Pick a time */}
      {step === 'time' && (
        <div>
          <button
            onClick={() => setStep('date')}
            className="text-sm text-gray-500 hover:text-black mb-4"
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
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {(slotsByDate[selectedDate] || []).map((slot) => (
              <button
                key={slot}
                onClick={() => {
                  setSelectedSlot(slot);
                  setStep('info');
                }}
                className="border rounded p-2 text-sm font-medium hover:bg-black hover:text-white transition-colors"
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
            className="text-sm text-gray-500 hover:text-black mb-4"
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
                className="w-full rounded border px-3 py-2 text-sm"
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
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="(555) 123-4567"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-black px-4 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {submitting ? 'Booking...' : 'Confirm Booking'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
