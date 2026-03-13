'use client';

import { useState, useRef } from 'react';
import { updateClass } from '../actions';
import { GROUP_SIZE_RANGES } from '@/lib/constants';
import type { Class } from '@/lib/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface Props {
  cls: Class;
}

export default function EditClassForm({ cls }: Props) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [groupType, setGroupType] = useState(cls.group_size_type);
  const submittingRef = useRef(false);
  const range = GROUP_SIZE_RANGES[groupType as keyof typeof GROUP_SIZE_RANGES];
  const isOneOnOne = groupType === 'one_on_one';
  const isLarge = groupType === 'large';

  async function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    const result = await updateClass(formData);
    if (result?.error) {
      setError(result.error);
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      {error && <p className="text-error text-sm mb-4">{error}</p>}
      <form action={handleSubmit} className="space-y-4">
        <input type="hidden" name="id" value={cls.id} />

        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input name="name" defaultValue={cls.name || ''} required className="w-full rounded border px-3 py-2" />
        </div>

        {isLarge && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Subject</label>
              <select name="subject" defaultValue={cls.subject || ''} className="w-full rounded border px-3 py-2">
                <option value="digital_rw">Digital R&W</option>
                <option value="digital_math">Digital Math</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Level</label>
              <select name="level" defaultValue={cls.level || ''} className="w-full rounded border px-3 py-2">
                <option value="essentials">Essentials</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
        )}
        {!isLarge && (
          <p className="text-sm text-slate-500">Subject and level are set per student at enrollment time.</p>
        )}

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
              <option value="large">Large (10-20)</option>
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
            <label className="block text-sm font-medium mb-1">
              {isLarge ? 'Meeting Day 1' : 'Meeting Day'}
            </label>
            <select name="meeting_day" defaultValue={cls.meeting_day} className="w-full rounded border px-3 py-2">
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {isLarge ? 'Meeting Time 1' : 'Meeting Time'}
            </label>
            <input type="time" name="meeting_time" defaultValue={cls.meeting_time} className="w-full rounded border px-3 py-2" />
          </div>
        </div>

        {isLarge && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Meeting Day 2</label>
              <select name="meeting_day_2" defaultValue={cls.meeting_day_2 || ''} className="w-full rounded border px-3 py-2">
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Meeting Time 2</label>
              <input type="time" name="meeting_time_2" defaultValue={cls.meeting_time_2 || ''} className="w-full rounded border px-3 py-2" />
            </div>
          </div>
        )}

        {isLarge && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input type="date" name="class_start_date" defaultValue={cls.class_start_date || ''} className="w-full rounded border px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input type="date" name="class_end_date" defaultValue={cls.class_end_date || ''} className="w-full rounded border px-3 py-2" />
            </div>
          </div>
        )}

        {!isLarge && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Enrollment Window Start</label>
              <input type="date" name="enrollment_window_start" defaultValue={cls.enrollment_window_start || ''} className="w-full rounded border px-3 py-2" />
              <p className="text-xs text-slate-400 mt-1">Earliest start date students can pick</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Enrollment Window End</label>
              <input type="date" name="enrollment_window_end" defaultValue={cls.enrollment_window_end || ''} className="w-full rounded border px-3 py-2" />
              <p className="text-xs text-slate-400 mt-1">Latest start date students can pick</p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Google Meet Link</label>
          <input type="url" name="google_meet_link" defaultValue={cls.google_meet_link || ''} placeholder="https://meet.google.com/..." className="w-full rounded border px-3 py-2" />
          <p className="text-xs text-slate-400 mt-1">Students see a &quot;Join Session&quot; button with this link</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Google Classroom ID (auto-created)</label>
          <input type="text" name="google_classroom_id" defaultValue={cls.google_classroom_id || ''} readOnly className="w-full rounded border px-3 py-2 bg-slate-50 text-slate-500" />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-navy-900 px-6 py-2 text-white font-medium hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Updating…' : 'Update Class'}
        </button>
      </form>
    </>
  );
}
