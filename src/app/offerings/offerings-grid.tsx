'use client';

import { useMemo } from 'react';
import WeeklyScheduleGrid, { type ScheduleSlot } from '@/components/weekly-schedule-grid';
import { ENROLLMENT_PERIOD } from '@/lib/constants';
import type { OfferingClassRow } from './page';

interface OfferingsGridProps {
  classes: OfferingClassRow[];
  enrollmentCounts: Record<string, number>;
}

function formatPeriodDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function OfferingsGrid({ classes, enrollmentCounts }: OfferingsGridProps) {
  const scheduleSlots: ScheduleSlot[] = useMemo(() => {
    const result: ScheduleSlot[] = [];
    for (const c of classes) {
      const enrolled = enrollmentCounts[c.id] || 0;
      const base: ScheduleSlot = {
        id: c.id,
        classId: c.id,
        subject: c.subject || '',
        level: c.level || '',
        groupSizeType: c.group_size_type as ScheduleSlot['groupSizeType'],
        meetingDay: c.meeting_day,
        meetingTime: c.meeting_time,
        capacity: c.capacity,
        enrolled,
        isFull: enrolled >= c.capacity,
        startDate: c.class_start_date,
        endDate: c.class_end_date,
      };
      result.push(base);

      if (c.meeting_day_2 && c.meeting_time_2) {
        result.push({
          ...base,
          id: `${c.id}_day2`,
          meetingDay: c.meeting_day_2,
          meetingTime: c.meeting_time_2,
        });
      }
    }
    return result;
  }, [classes, enrollmentCounts]);

  return (
    <div className="space-y-6">
      {/* Enrollment period info */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800 text-xs font-bold">i</div>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Current enrollment period: {formatPeriodDate(ENROLLMENT_PERIOD.start)} &ndash; {formatPeriodDate(ENROLLMENT_PERIOD.end)}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Choose a start date within this window. Your class runs for 4 weeks from the week you sign up.
            </p>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-bold text-navy-900">Weekly Schedule</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pick 2 weekly time slots that fit your schedule
          </p>
        </div>

        <div className="p-6">
          {scheduleSlots.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">No slots available right now. Check back soon.</p>
            </div>
          ) : (
            <WeeklyScheduleGrid slots={scheduleSlots} hideWaitlist />
          )}
        </div>
      </div>

      {/* Waitlist note — after calendar so user sees slots first */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm font-semibold text-amber-900">Can&apos;t find 2 open slots that work for you?</p>
        <p className="text-xs text-amber-700 mt-0.5">
          No worries &mdash; you can join the waitlist when you enroll and we&apos;ll notify you when spots open up.
          Your waitlist spot is held until the end of the enrollment period.
        </p>
      </div>
    </div>
  );
}
