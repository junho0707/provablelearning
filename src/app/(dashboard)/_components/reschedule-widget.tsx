'use client';

import { useState, useEffect, useCallback } from 'react';

interface SlotsByDate {
  [date: string]: string[];
}

interface Props {
  cancellationId: string;
}

export function RescheduleWidget({ cancellationId }: Props) {
  const [step, setStep] = useState<'date' | 'time' | 'done'>('date');
  const [loading, setLoading] = useState(true);
  const [slotsByDate, setSlotsByDate] = useState<SlotsByDate>({});
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/cancellations/reschedule-slots?cancellation_id=${cancellationId}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load slots.');
        setLoading(false);
        return;
      }
      if (data.slots) {
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
  }, [cancellationId]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const dates = Object.keys(slotsByDate).sort();

  async function handleConfirm() {
    if (!selectedSlot) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/cancellations/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancellationId,
          dateTime: selectedSlot,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Reschedule failed.');
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
        <h2 className="text-xl font-semibold mb-2">Session Rescheduled!</h2>
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
          A calendar invite has been sent with the meeting details.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3 mb-4">
          {error}
        </div>
      )}

      {/* Step 1: Pick a date */}
      {step === 'date' && (
        <div>
          <h2 className="font-semibold mb-4">Select a Date (1-hour session)</h2>
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
                      {d.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-gray-500">
                      {slotsByDate[date].length} slot
                      {slotsByDate[date].length === 1 ? '' : 's'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Pick a time and confirm */}
      {step === 'time' && (
        <div>
          <button
            onClick={() => {
              setStep('date');
              setSelectedSlot('');
            }}
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
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
            {(slotsByDate[selectedDate] || []).map((slot) => (
              <button
                key={slot}
                onClick={() => setSelectedSlot(slot)}
                className={`border rounded p-2 text-sm font-medium transition-colors ${
                  selectedSlot === slot
                    ? 'bg-black text-white'
                    : 'hover:bg-gray-50'
                }`}
              >
                {new Date(slot).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </button>
            ))}
          </div>

          {selectedSlot && (
            <div className="border-t pt-4">
              <p className="text-sm text-gray-600 mb-3">
                Reschedule to{' '}
                {new Date(selectedSlot).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                at{' '}
                {new Date(selectedSlot).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
                (1 hour)
              </p>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="w-full rounded bg-black px-4 py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {submitting ? 'Rescheduling...' : 'Confirm Reschedule'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
