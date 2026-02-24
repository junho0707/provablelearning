'use client';

import { useState } from 'react';
import { updateMakeupSession } from '../actions';

interface Props {
  session: Record<string, unknown>;
}

export default function EditMakeupSessionForm({ session }: Props) {
  const [error, setError] = useState('');

  async function handleSubmit(formData: FormData) {
    const result = await updateMakeupSession(formData);
    if (result?.error) setError(result.error);
  }

  return (
    <>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <form action={handleSubmit} className="space-y-4">
        <input type="hidden" name="id" value={session.id as string} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <select name="subject" defaultValue={session.subject as string} className="w-full rounded border px-3 py-2">
              <option value="digital_rw">SAT RW</option>
              <option value="digital_math">SAT Math</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Level</label>
            <select name="level" defaultValue={session.level as string} className="w-full rounded border px-3 py-2">
              <option value="essentials">Essentials</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Group Size</label>
          <select name="group_size_type" defaultValue={session.group_size_type as string} className="w-full rounded border px-3 py-2">
            <option value="small">Small</option>
            <option value="medium">Medium</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input type="date" name="session_date" defaultValue={session.session_date as string} required className="w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Time</label>
            <input type="time" name="session_time" defaultValue={session.session_time as string} required className="w-full rounded border px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Capacity</label>
          <input
            type="number"
            name="capacity"
            defaultValue={session.capacity as number}
            min={1}
            max={30}
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Google Meet Link</label>
          <input type="url" name="google_meet_link" defaultValue={(session.google_meet_link as string) || ''} className="w-full rounded border px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Location</label>
          <input type="text" name="location" defaultValue={(session.location as string) || ''} className="w-full rounded border px-3 py-2" />
        </div>

        <button type="submit" className="rounded bg-black px-6 py-2 text-white font-medium hover:bg-gray-800">
          Update Makeup Session
        </button>
      </form>
    </>
  );
}
