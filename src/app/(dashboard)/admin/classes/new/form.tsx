'use client';

import { useState, useRef } from 'react';
import { createClass, createBatchSlots } from '../actions';
import { GROUP_SIZE_RANGES } from '@/lib/constants';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface DayGroup {
  day: string;
  times: string[];
}

export default function NewClassForm() {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [groupType, setGroupType] = useState<string>('small');
  const submittingRef = useRef(false);

  // Day-grouped slot state (SG + 1:1)
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([{ day: 'Monday', times: [''] }]);

  const range = GROUP_SIZE_RANGES[groupType as keyof typeof GROUP_SIZE_RANGES];
  const isOneOnOne = groupType === 'one_on_one';
  const isLarge = groupType === 'large';
  const isSmall = groupType === 'small';
  const usesSlotBuilder = isSmall || isOneOnOne;

  function addDay() {
    const usedDays = dayGroups.map((g) => g.day);
    const nextDay = DAYS.find((d) => !usedDays.includes(d)) ?? DAYS[0];
    setDayGroups((prev) => [...prev, { day: nextDay, times: [''] }]);
  }

  function removeDay(dayIndex: number) {
    setDayGroups((prev) => prev.filter((_, i) => i !== dayIndex));
  }

  function updateDay(dayIndex: number, newDay: string) {
    setDayGroups((prev) => prev.map((g, i) => (i === dayIndex ? { ...g, day: newDay } : g)));
  }

  function addTime(dayIndex: number) {
    setDayGroups((prev) =>
      prev.map((g, i) => (i === dayIndex ? { ...g, times: [...g.times, ''] } : g))
    );
  }

  function removeTime(dayIndex: number, timeIndex: number) {
    setDayGroups((prev) =>
      prev.map((g, i) =>
        i === dayIndex ? { ...g, times: g.times.filter((_, ti) => ti !== timeIndex) } : g
      )
    );
  }

  function updateTime(dayIndex: number, timeIndex: number, value: string) {
    setDayGroups((prev) =>
      prev.map((g, i) =>
        i === dayIndex
          ? { ...g, times: g.times.map((t, ti) => (ti === timeIndex ? value : t)) }
          : g
      )
    );
  }

  async function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');

    if (usesSlotBuilder) {
      // Flatten day groups into slots
      const validSlots = dayGroups.flatMap((g) =>
        g.times.filter((t) => t).map((t) => ({ day: g.day, time: t }))
      );
      if (validSlots.length === 0) {
        setError('Add at least one time slot');
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }

      // Call batch action (SG/1:1 are subject-agnostic)
      const result = await createBatchSlots({
        name: formData.get('name') as string,
        group_size_type: groupType as 'small' | 'one_on_one',
        capacity: Number(formData.get('capacity')),
        slots: validSlots,
        enrollment_window_start: (formData.get('enrollment_window_start') as string) || null,
        enrollment_window_end: (formData.get('enrollment_window_end') as string) || null,
      });
      if (result?.error) {
        setError(result.error);
        submittingRef.current = false;
        setSubmitting(false);
      }
    } else {
      const result = await createClass(formData);
      if (result?.error) {
        setError(result.error);
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  const validSlotCount = dayGroups.reduce((n, g) => n + g.times.filter((t) => t).length, 0);

  return (
    <>
      {error && <p className="text-error text-sm mb-4">{error}</p>}
      <form action={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input name="name" required className="w-full rounded border px-3 py-2" placeholder={isSmall ? 'e.g. Digital SAT R&W Essentials SG' : isOneOnOne ? 'e.g. DSAT Math 1:1' : 'e.g. Digital SAT Math Essentials – Mon'} />
        </div>

        {isLarge && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Subject</label>
              <select name="subject" required className="w-full rounded border px-3 py-2">
                <option value="">Select subject</option>
                <option value="digital_rw">Digital R&W</option>
                <option value="digital_math">Digital Math</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Level</label>
              <select name="level" required className="w-full rounded border px-3 py-2">
                <option value="">Select level</option>
                <option value="essentials">Essentials</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
        )}
        {usesSlotBuilder && (
          <p className="text-sm text-slate-500">Subject and level are set per student at enrollment time.</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Group Size Type</label>
            <select
              name="group_size_type"
              value={groupType}
              onChange={(e) => setGroupType(e.target.value)}
              className="w-full rounded border px-3 py-2"
            >
              <option value="one_on_one">1:1</option>
              <option value="small">Small (2-4)</option>
              <option value="large">Large (10-20)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Capacity ({range.min}-{range.max})
            </label>
            <input
              type="number"
              name="capacity"
              min={range.min}
              max={range.max}
              defaultValue={range.min}
              required
              className="w-full rounded border px-3 py-2"
            />
          </div>
        </div>

        {/* SG + 1:1: day-grouped slot builder */}
        {usesSlotBuilder && (
          <div>
            <label className="block text-sm font-medium mb-2">Time Slots</label>
            <p className="text-xs text-slate-500 mb-3">
              {isSmall
                ? 'Add all the weekly time slots students can choose from. Each slot creates a separate class entry.'
                : 'Add all available 1:1 time slots. Each slot creates a separate class entry.'}
            </p>
            <div className="space-y-4">
              {dayGroups.map((group, di) => (
                <div key={di} className="rounded border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <select
                      value={group.day}
                      onChange={(e) => updateDay(di, e.target.value)}
                      className="rounded border px-3 py-1.5 font-medium"
                    >
                      {DAYS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    {dayGroups.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDay(di)}
                        className="text-red-500 hover:text-red-700 text-xs px-2"
                      >
                        Remove day
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {group.times.map((time, ti) => (
                      <div key={ti} className="flex items-center gap-1">
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => updateTime(di, ti, e.target.value)}
                          required
                          className="rounded border px-2 py-1.5 text-sm"
                        />
                        {group.times.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTime(di, ti)}
                            className="text-red-400 hover:text-error text-sm leading-none px-1"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addTime(di)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + Add time
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addDay}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add another day
            </button>
          </div>
        )}

        {/* LG: single day+time x2 */}
        {isLarge && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Meeting Day 1</label>
                <select name="meeting_day" required className="w-full rounded border px-3 py-2">
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Meeting Time 1</label>
                <input type="time" name="meeting_time" required className="w-full rounded border px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Meeting Day 2</label>
                <select name="meeting_day_2" required className="w-full rounded border px-3 py-2">
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Meeting Time 2</label>
                <input type="time" name="meeting_time_2" required className="w-full rounded border px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <input type="date" name="class_start_date" required className="w-full rounded border px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input type="date" name="class_end_date" required className="w-full rounded border px-3 py-2" />
              </div>
            </div>
          </>
        )}

        {!isLarge && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Enrollment Window Start</label>
              <input type="date" name="enrollment_window_start" className="w-full rounded border px-3 py-2" />
              <p className="text-xs text-slate-400 mt-1">Earliest start date students can pick</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Enrollment Window End</label>
              <input type="date" name="enrollment_window_end" className="w-full rounded border px-3 py-2" />
              <p className="text-xs text-slate-400 mt-1">Latest start date students can pick</p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-navy-900 px-6 py-2 text-white font-medium hover:bg-navy-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating…' : usesSlotBuilder ? `Create ${validSlotCount} Slot${validSlotCount !== 1 ? 's' : ''}` : 'Create Class'}
        </button>
      </form>
    </>
  );
}
