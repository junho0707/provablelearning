'use client';

import { useState } from 'react';
import { updateBookingWindow } from './actions';

export function BookingWindowForm({
  windowStart,
  windowEnd,
}: {
  windowStart: string;
  windowEnd: string;
}) {
  const [start, setStart] = useState(windowStart);
  const [end, setEnd] = useState(windowEnd);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const isActive = start && end;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    const fd = new FormData();
    fd.set('window_start', start);
    fd.set('window_end', end);

    const result = await updateBookingWindow(fd);
    if (result.error) {
      setMessage(result.error);
    } else {
      setMessage('Booking window updated.');
    }
    setSaving(false);
  }

  async function handleClear() {
    setSaving(true);
    setMessage('');
    setStart('');
    setEnd('');

    const fd = new FormData();
    const result = await updateBookingWindow(fd);
    if (result.error) {
      setMessage(result.error);
    } else {
      setMessage('Booking window cleared. Consultations are disabled.');
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${isActive ? 'bg-success-light0' : 'bg-gray-300'}`}
        />
        <span className="text-sm font-medium">
          {isActive ? 'Active' : 'Disabled'}
        </span>
        {isActive && (
          <span className="text-sm text-slate-500">
            ({start} to {end})
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Start Date</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">End Date</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.includes('error') || message.includes('Error') ? 'text-error' : 'text-green-600'}`}>
          {message}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || (!start && !end)}
          className="rounded bg-navy-900 px-4 py-2 text-sm text-white font-medium hover:bg-navy-800 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Window'}
        </button>
        {isActive && (
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="rounded border px-4 py-2 text-sm font-medium hover:bg-navy-50 disabled:opacity-50"
          >
            Clear (Disable)
          </button>
        )}
      </div>
    </form>
  );
}
