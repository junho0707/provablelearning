'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import WeeklyScheduleGrid, { type ScheduleSlot } from '@/components/weekly-schedule-grid';
import { ENROLLMENT_PERIOD } from '@/lib/constants';

export interface ClassRow {
  id: string;
  name: string | null;
  subject: string | null;
  level: string | null;
  group_size_type: string;
  meeting_day: string;
  meeting_time: string;
  meeting_day_2: string | null;
  meeting_time_2: string | null;
  capacity: number;
  active: boolean;
  class_start_date: string | null;
  class_end_date: string | null;
  enrollment_window_start: string | null;
  enrollment_window_end: string | null;
}

interface ClassBrowserProps {
  classes: ClassRow[];
  enrollmentCounts: Record<string, number>;
}

export default function ClassBrowser({ classes, enrollmentCounts }: ClassBrowserProps) {
  const router = useRouter();
  const [selectedDualSlot1, setSelectedDualSlot1] = useState<ScheduleSlot | null>(null);

  // Waitlist multi-select mode
  const [waitlistProgramKey, setWaitlistProgramKey] = useState<string | null>(null);
  const [waitlistSelectedIds, setWaitlistSelectedIds] = useState<Set<string>>(new Set());
  const MAX_WAITLIST_SLOTS = 4;

  const today = new Date().toISOString().split('T')[0];

  // Convert ClassRow[] → ScheduleSlot[]
  const scheduleSlots: ScheduleSlot[] = useMemo(() => {
    const result: ScheduleSlot[] = [];
    for (const c of classes) {
      const enrolled = enrollmentCounts[c.id] || 0;
      const isWindowClosed = !!c.enrollment_window_end && today > c.enrollment_window_end;
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
        isWindowClosed,
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
  }, [classes, enrollmentCounts, today]);

  // Compute compatible dual-slot IDs (same group_size_type, different slot)
  const compatibleSlotIds = useMemo(() => {
    if (!selectedDualSlot1) return new Set<string>();
    const ids = new Set<string>();
    for (const slot of scheduleSlots) {
      if (
        (slot.groupSizeType === 'small' || slot.groupSizeType === 'one_on_one') &&
        slot.groupSizeType === selectedDualSlot1.groupSizeType &&
        slot.id !== selectedDualSlot1.id &&
        slot.meetingDay !== selectedDualSlot1.meetingDay &&
        !slot.isFull &&
        !slot.isWindowClosed
      ) {
        ids.add(slot.id);
      }
    }
    return ids;
  }, [selectedDualSlot1, scheduleSlots]);

  const enterWaitlistMode = (programKey: string) => {
    setWaitlistProgramKey(programKey);
    setWaitlistSelectedIds(new Set());
    setSelectedDualSlot1(null);
  };

  const exitWaitlistMode = () => {
    setWaitlistProgramKey(null);
    setWaitlistSelectedIds(new Set());
  };

  const waitlistProgramSlotIds = useMemo(() => {
    if (!waitlistProgramKey) return new Set<string>();
    const ids = new Set<string>();
    for (const slot of scheduleSlots) {
      if (slot.groupSizeType === waitlistProgramKey && !slot.isWindowClosed) {
        ids.add(slot.id);
      }
    }
    return ids;
  }, [waitlistProgramKey, scheduleSlots]);

  const handleSlotClick = (slot: ScheduleSlot) => {
    // Waitlist multi-select mode
    if (waitlistProgramKey) {
      if (slot.groupSizeType !== waitlistProgramKey || slot.isWindowClosed) return;

      setWaitlistSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(slot.classId)) {
          next.delete(slot.classId);
        } else if (next.size < MAX_WAITLIST_SLOTS) {
          next.add(slot.classId);
        }
        return next;
      });
      return;
    }

    // Full slots — not clickable for SG/1:1 (waitlist is separate)
    if (slot.isFull) {
      if (slot.groupSizeType === 'large') {
        router.push(`/enroll/${slot.classId}`);
      }
      return;
    }

    // LG → go straight to enroll
    if (slot.groupSizeType === 'large') {
      router.push(`/enroll/${slot.classId}`);
      return;
    }

    // SG / 1:1 → 2-slot selection
    if (!selectedDualSlot1) {
      setSelectedDualSlot1(slot);
    } else if (selectedDualSlot1.id === slot.id) {
      setSelectedDualSlot1(null);
    } else if (compatibleSlotIds.has(slot.id)) {
      router.push(`/enroll/${selectedDualSlot1.classId}?slot2=${slot.classId}`);
    }
  };

  const formatPeriodDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

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

      {/* Waitlist selection mode banner */}
      {waitlistProgramKey && (() => {
        const firstSelectedId = [...waitlistSelectedIds][0];
        return (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 text-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-amber-900">
                  Join Waitlist
                </p>
                <p className="text-amber-800 mt-1">
                  Select the time slots that work for you (up to {MAX_WAITLIST_SLOTS}). You&apos;ll be notified when enough slots open up.
                </p>
              </div>
              <button
                onClick={exitWaitlistMode}
                className="text-amber-700 underline hover:text-amber-900 text-xs shrink-0"
              >
                Cancel
              </button>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-amber-800 font-medium">
                {waitlistSelectedIds.size} slot{waitlistSelectedIds.size !== 1 ? 's' : ''} selected
                {waitlistSelectedIds.size < 2 && <span className="font-normal text-amber-600"> (minimum 2)</span>}
              </span>
              <button
                disabled={waitlistSelectedIds.size < 2 || !firstSelectedId}
                onClick={() => {
                  const slotsParam = [...waitlistSelectedIds].join(',');
                  router.push(`/enroll/${firstSelectedId}?waitlist_slots=${slotsParam}`);
                }}
                className="w-full sm:w-auto sm:ml-auto px-4 py-2 sm:py-1.5 rounded-lg bg-amber-600 text-white font-medium text-sm hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Waitlist
              </button>
            </div>
          </div>
        );
      })()}

      {/* Dual-slot selection banner */}
      {!waitlistProgramKey && selectedDualSlot1 && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm flex items-center gap-3">
          <span>
            <strong>Slot 1 selected.</strong> Now pick your second time slot.
          </span>
          <button
            onClick={() => setSelectedDualSlot1(null)}
            className="ml-auto text-blue-700 underline hover:text-blue-900 text-xs"
          >
            Clear
          </button>
        </div>
      )}

      {/* Schedule card */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-navy-900">Weekly Schedule</h2>
          <p className="mt-1 text-sm text-slate-500">
            Small group sessions &mdash; max 3 students, 1.5 hours each
          </p>
        </div>

        <div className="p-6">
          <p className="text-xs text-slate-500 mb-3">
            {waitlistProgramKey
              ? 'Click slots in the grid to select your preferred time slots for the waitlist.'
              : 'Click any slot to start. You\u2019ll need to pick 2 time slots.'}
          </p>

          {scheduleSlots.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">No slots available right now. Check back soon.</p>
            </div>
          ) : (
            <WeeklyScheduleGrid
              slots={scheduleSlots}
              onSlotClick={handleSlotClick}
              selectedSlotId={waitlistProgramKey ? undefined : selectedDualSlot1?.id}
              compatibleSlotIds={waitlistProgramKey ? undefined : compatibleSlotIds}
              multiSelectedIds={waitlistProgramKey ? waitlistSelectedIds : undefined}
              multiEligibleIds={waitlistProgramKey ? waitlistProgramSlotIds : undefined}
            />
          )}
        </div>
      </div>

      {/* Waitlist CTA — after calendar so user sees slots first */}
      {!waitlistProgramKey && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Can&apos;t find 2 open slots that work for you?</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Pick 2–4 time slots you&apos;d prefer and we&apos;ll notify you when spots open up.
              Your waitlist spot is held until the end of the enrollment period.
            </p>
          </div>
          <button
            onClick={() => enterWaitlistMode('small')}
            className="shrink-0 rounded-lg bg-navy-900 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-800"
          >
            Join Waitlist
          </button>
        </div>
      )}

    </div>
  );
}
