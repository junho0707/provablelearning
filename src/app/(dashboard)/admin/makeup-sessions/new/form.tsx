'use client';

import { useState } from 'react';
import { createMakeupSession } from '../actions';

export default function NewMakeupSessionForm() {
  const [error, setError] = useState('');

  async function handleSubmit(formData: FormData) {
    const result = await createMakeupSession(formData);
    if (result?.error) setError(result.error);
  }

  return (
    <>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <form action={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <select name="subject" required className="w-full rounded border px-3 py-2">
              <option value="digital_rw">SAT RW</option>
              <option value="digital_math">SAT Math</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Level</label>
            <select name="level" required className="w-full rounded border px-3 py-2">
              <option value="essentials">Essentials</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Group Size</label>
          <select name="group_size_type" required className="w-full rounded border px-3 py-2">
            <option value="small">Small</option>
            <option value="medium">Medium</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input type="date" name="session_date" required className="w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Time</label>
            <input type="time" name="session_time" required className="w-full rounded border px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Capacity</label>
          <input
            type="number"
            name="capacity"
            min={1}
            max={30}
            defaultValue={10}
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Google Meet Link (optional)</label>
          <input type="url" name="google_meet_link" placeholder="https://meet.google.com/..." className="w-full rounded border px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Location (optional)</label>
          <input type="text" name="location" placeholder="e.g. Room 201" className="w-full rounded border px-3 py-2" />
        </div>

        <button
          type="submit"
          className="rounded bg-black px-6 py-2 text-white font-medium hover:bg-gray-800"
        >
          Create Makeup Session
        </button>
      </form>
    </>
  );
}
