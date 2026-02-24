'use client';

import { useState } from 'react';
import { createCourse } from '../actions';

export default function NewCoursePage() {
  const [error, setError] = useState('');

  async function handleSubmit(formData: FormData) {
    const result = await createCourse(formData);
    if (result?.error) setError(result.error);
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">New Course</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input name="name" required className="w-full rounded border px-3 py-2" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <select name="subject" required className="w-full rounded border px-3 py-2">
              <option value="digital_rw">Digital SAT R&W</option>
              <option value="digital_math">Digital SAT Math</option>
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input type="date" name="start_date" required className="w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input type="date" name="end_date" required className="w-full rounded border px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Max Re-enrollments</label>
          <input type="number" name="max_reenroll" defaultValue={3} min={1} max={10} className="w-full rounded border px-3 py-2" />
        </div>

        <button
          type="submit"
          className="rounded bg-black px-6 py-2 text-white font-medium hover:bg-gray-800"
        >
          Create Course
        </button>
      </form>
    </div>
  );
}
