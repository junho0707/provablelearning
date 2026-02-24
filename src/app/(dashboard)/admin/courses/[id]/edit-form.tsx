'use client';

import { useState } from 'react';
import { updateCourse, deleteCourse } from '../actions';
import type { Course } from '@/lib/types';

export default function EditCourseForm({ course }: { course: Course }) {
  const [error, setError] = useState('');

  async function handleUpdate(formData: FormData) {
    const result = await updateCourse(formData);
    if (result?.error) setError(result.error);
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this course?')) return;
    const result = await deleteCourse(course.id);
    if (result?.error) setError(result.error);
  }

  return (
    <>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <form action={handleUpdate} className="space-y-4">
        <input type="hidden" name="id" value={course.id} />

        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input name="name" defaultValue={course.name} required className="w-full rounded border px-3 py-2" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <select name="subject" defaultValue={course.subject} required className="w-full rounded border px-3 py-2">
              <option value="digital_rw">Digital SAT R&W</option>
              <option value="digital_math">Digital SAT Math</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Level</label>
            <select name="level" defaultValue={course.level} required className="w-full rounded border px-3 py-2">
              <option value="essentials">Essentials</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input type="date" name="start_date" defaultValue={course.start_date} required className="w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input type="date" name="end_date" defaultValue={course.end_date} required className="w-full rounded border px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Max Re-enrollments</label>
          <input type="number" name="max_reenroll" defaultValue={course.max_reenroll} min={1} max={10} className="w-full rounded border px-3 py-2" />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded bg-black px-6 py-2 text-white font-medium hover:bg-gray-800"
          >
            Update Course
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded border border-red-600 px-6 py-2 text-red-600 font-medium hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </form>
    </>
  );
}
