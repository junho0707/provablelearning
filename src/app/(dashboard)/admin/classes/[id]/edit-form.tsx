'use client';

import { useState } from 'react';
import { updateClass } from '../actions';
import { GROUP_SIZE_RANGES } from '@/lib/constants';
import type { Class } from '@/lib/types';

interface Props {
  cls: Class;
  courses: Array<{ id: string; name: string; subject: string }>;
}

export default function EditClassForm({ cls, courses }: Props) {
  const [error, setError] = useState('');
  const [groupType, setGroupType] = useState(cls.group_size_type);
  const range = GROUP_SIZE_RANGES[groupType as keyof typeof GROUP_SIZE_RANGES];

  async function handleSubmit(formData: FormData) {
    const result = await updateClass(formData);
    if (result?.error) setError(result.error);
  }

  return (
    <>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <form action={handleSubmit} className="space-y-4">
        <input type="hidden" name="id" value={cls.id} />

        <div>
          <label className="block text-sm font-medium mb-1">Course</label>
          <select name="course_id" defaultValue={cls.course_id} className="w-full rounded border px-3 py-2">
            {courses.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.subject.replace('_', ' ')})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Group Size Type</label>
            <select
              name="group_size_type"
              value={groupType}
              onChange={(e) => setGroupType(e.target.value as typeof groupType)}
              className="w-full rounded border px-3 py-2"
            >
              <option value="one_on_one">1:1</option>
              <option value="small">Small (2-4)</option>
              <option value="medium">Medium (5-9)</option>
              <option value="large">Large (10-30)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Capacity ({range.min}-{range.max})</label>
            <input
              type="number"
              name="capacity"
              defaultValue={cls.capacity}
              min={range.min}
              max={range.max}
              required
              className="w-full rounded border px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Meeting Day</label>
            <select name="meeting_day" defaultValue={cls.meeting_day} className="w-full rounded border px-3 py-2">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Meeting Time</label>
            <input type="time" name="meeting_time" defaultValue={cls.meeting_time} className="w-full rounded border px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Google Meet Link</label>
          <input type="url" name="google_meet_link" defaultValue={cls.google_meet_link || ''} className="w-full rounded border px-3 py-2" />
        </div>

        <button type="submit" className="rounded bg-black px-6 py-2 text-white font-medium hover:bg-gray-800">
          Update Class
        </button>
      </form>
    </>
  );
}
