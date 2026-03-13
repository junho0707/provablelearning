'use client';

import { useState } from 'react';

// Shared weekly schedule grid: days as columns, times as rows.
// Used by both /offerings (read-only) and /enroll (interactive enrollment).

export interface ScheduleSlot {
  id: string;
  /** The original class id (same as id, but useful when LG creates 2 grid entries) */
  classId: string;
  subject: string | null;
  level: string | null;
  groupSizeType: 'one_on_one' | 'small' | 'large';
  meetingDay: string;
  meetingTime: string;
  capacity: number;
  enrolled: number;
  isFull: boolean;
  isWindowClosed?: boolean;
  /** For LG: start/end dates */
  startDate?: string | null;
  endDate?: string | null;
}

interface WeeklyScheduleGridProps {
  slots: ScheduleSlot[];
  /** Called when a slot block is clicked. If omitted, grid is read-only. */
  onSlotClick?: (slot: ScheduleSlot) => void;
  /** ID of the currently selected SG slot 1 */
  selectedSlotId?: string | null;
  /** Set of slot IDs that are compatible as slot 2 (highlighted) */
  compatibleSlotIds?: Set<string>;
  /** Set of slot IDs selected in multi-select mode (waitlist) */
  multiSelectedIds?: Set<string>;
  /** Set of slot IDs eligible for selection in multi-select mode */
  multiEligibleIds?: Set<string>;
  /** Hide waitlist labels on full slots (for offerings page) */
  hideWaitlist?: boolean;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseTimeToMinutes(raw: string): number {
  const trimmed = raw.trim();
  const amPmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (amPmMatch) {
    let h = parseInt(amPmMatch[1], 10);
    const m = parseInt(amPmMatch[2], 10);
    const period = amPmMatch[3].toUpperCase();
    if (period === 'AM' && h === 12) h = 0;
    if (period === 'PM' && h !== 12) h += 12;
    return h * 60 + m;
  }
  const [hStr, mStr] = trimmed.split(':');
  return parseInt(hStr, 10) * 60 + parseInt(mStr || '0', 10);
}

function formatTime12h(raw: string): string {
  const mins = parseTimeToMinutes(raw);
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Convert EST minutes to PST (subtract 3 hours) */
function estToPstMinutes(estMins: number): number {
  return estMins - 180;
}

function formatMinutesTo12h(mins: number): string {
  // Handle negative or overflow from timezone shift
  let adjusted = mins;
  if (adjusted < 0) adjusted += 1440;
  if (adjusted >= 1440) adjusted -= 1440;
  let h = Math.floor(adjusted / 60);
  const m = adjusted % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, '0')} ${period}`;
}

function subjectShort(subject: string | null): string {
  switch (subject) {
    case 'digital_rw': return 'R&W';
    case 'digital_math': return 'Math';
    case 'digital_rw_math': return 'R&W+Math';
    case null: return '';
    default: return subject;
  }
}

function groupSizeLabel(gs: string): string {
  switch (gs) {
    case 'one_on_one': return '1:1';
    case 'small': return 'SG';
    case 'large': return 'LG';
    default: return gs;
  }
}

type Timezone = 'EST' | 'PST';

export default function WeeklyScheduleGrid({
  slots,
  onSlotClick,
  selectedSlotId,
  compatibleSlotIds,
  multiSelectedIds,
  multiEligibleIds,
  hideWaitlist,
}: WeeklyScheduleGridProps) {
  const [timezone, setTimezone] = useState<Timezone>('EST');
  const interactive = !!onSlotClick;

  const formatTimeForTz = (raw: string): string => {
    if (timezone === 'EST') return formatTime12h(raw);
    const estMins = parseTimeToMinutes(raw);
    const pstMins = estToPstMinutes(estMins);
    return formatMinutesTo12h(pstMins);
  };

  // Unique sorted times (sorted by EST minutes regardless of display tz)
  const uniqueTimes = [...new Set(slots.map((s) => s.meetingTime))].sort(
    (a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b)
  );

  // Build lookup: day+time -> slots
  const cellMap = new Map<string, ScheduleSlot[]>();
  slots.forEach((s) => {
    const key = `${s.meetingDay}|${s.meetingTime}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key)!.push(s);
  });

  const getSlotStyle = (slot: ScheduleSlot): string => {
    const isSelected = selectedSlotId === slot.id;
    const isCompatible = compatibleSlotIds?.has(slot.id);
    const isMultiSelected = multiSelectedIds?.has(slot.id);

    if (slot.isWindowClosed) {
      return 'bg-gray-100 text-gray-400 border-gray-200 cursor-default';
    }

    if (isMultiSelected) {
      return 'bg-amber-200 border-amber-500 ring-2 ring-amber-400 cursor-pointer';
    }

    if (multiEligibleIds && multiEligibleIds.size > 0 && !isMultiSelected) {
      const isEligible = multiEligibleIds.has(slot.id);
      if (isEligible) {
        return 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 cursor-pointer';
      }
      return 'bg-gray-50 text-gray-400 border-gray-200 cursor-default opacity-40';
    }

    if (isSelected) {
      return 'bg-blue-200 border-blue-500 ring-2 ring-blue-400 cursor-pointer';
    }

    if (isCompatible) {
      return 'bg-blue-100 border-blue-400 hover:bg-blue-200 cursor-pointer';
    }

    if (selectedSlotId && (slot.groupSizeType === 'small' || slot.groupSizeType === 'one_on_one') && !isCompatible) {
      return 'bg-gray-50 text-gray-400 border-gray-200 cursor-default';
    }

    if (slot.isFull) {
      switch (slot.groupSizeType) {
        case 'one_on_one':
          return 'bg-purple-50/60 border-purple-200 text-purple-400 cursor-default';
        case 'small':
          return 'bg-blue-50/60 border-blue-200 text-blue-400 cursor-default';
        case 'large':
          return interactive
            ? 'bg-amber-50/60 border-amber-200 text-amber-400 hover:bg-amber-100/60 cursor-pointer'
            : 'bg-amber-50/60 border-amber-200 text-amber-400';
        default:
          return 'bg-gray-50 border-gray-200';
      }
    }

    switch (slot.groupSizeType) {
      case 'one_on_one':
        return interactive
          ? 'bg-purple-50 border-purple-300 hover:bg-purple-100 cursor-pointer'
          : 'bg-purple-50 border-purple-200';
      case 'small':
        return interactive
          ? 'bg-blue-50 border-blue-300 hover:bg-blue-100 cursor-pointer'
          : 'bg-blue-50 border-blue-200';
      case 'large':
        return interactive
          ? 'bg-amber-50 border-amber-300 hover:bg-amber-100 cursor-pointer'
          : 'bg-amber-50 border-amber-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const statusText = (slot: ScheduleSlot): string => {
    if (slot.isWindowClosed) return 'Closed';
    return `${slot.enrolled}/${slot.capacity}`;
  };

  const renderSlotBlock = (slot: ScheduleSlot) => {
    const isSelected = selectedSlotId === slot.id;
    const isCompatible = compatibleSlotIds?.has(slot.id);
    const isMultiSelected = multiSelectedIds?.has(slot.id);
    const inMultiMode = multiEligibleIds !== undefined && multiEligibleIds.size > 0;

    const isDualSlotType = slot.groupSizeType === 'small' || slot.groupSizeType === 'one_on_one';
    const clickable = interactive && (
      !slot.isWindowClosed &&
      (
        (inMultiMode && multiEligibleIds?.has(slot.id)) ||
        (slot.isFull ? slot.groupSizeType === 'large' : (!isDualSlotType || !selectedSlotId || isSelected || isCompatible))
      )
    );

    return (
      <button
        key={`${slot.id}-${slot.meetingDay}`}
        onClick={() => clickable && onSlotClick?.(slot)}
        disabled={!clickable}
        className={`block w-full text-left text-xs rounded-lg border p-2 mb-1 last:mb-0 transition-colors ${getSlotStyle(slot)}`}
      >
        <div className="flex items-center gap-1">
          {isMultiSelected && <span className="text-amber-700">&#10003;</span>}
          <span className="font-bold">{groupSizeLabel(slot.groupSizeType)}</span>
          {slot.subject && <span className="font-medium">{subjectShort(slot.subject)}</span>}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className={`${slot.isWindowClosed ? 'text-gray-400' : slot.isFull ? 'text-red-500' : 'text-green-700'}`}>
            {statusText(slot)}
          </span>
          {isMultiSelected ? (
            <span className="text-[10px] font-medium text-amber-700">Selected</span>
          ) : slot.isFull && !slot.isWindowClosed && !hideWaitlist ? (
            <span className="text-[10px] font-medium text-red-500">Full</span>
          ) : slot.level && slot.level !== 'all_levels' ? (
            <span className="text-[10px] text-gray-500">{slot.level}</span>
          ) : null}
        </div>
      </button>
    );
  };

  // --- Desktop: day × time grid ---
  const renderDesktop = () => (
    <div className="hidden md:block overflow-x-auto">
      <div
        className="grid gap-px rounded-xl overflow-hidden bg-navy-100"
        style={{
          gridTemplateColumns: `64px repeat(${DAYS.length}, minmax(88px, 1fr))`,
        }}
      >
        {/* Header row */}
        <div className="bg-navy-50 p-2 text-xs font-medium text-navy-400" />
        {DAYS.map((day) => (
          <div key={day} className="bg-navy-50 p-2 text-xs font-semibold text-navy-700 text-center">
            {day.slice(0, 3)}
          </div>
        ))}

        {/* Time rows */}
        {uniqueTimes.map((time) => (
          <div key={`row-${time}`} className="contents">
            <div className="bg-white p-2 text-xs text-navy-500 font-medium flex items-start">
              {formatTimeForTz(time)}
            </div>
            {DAYS.map((day) => {
              const cellSlots = cellMap.get(`${day}|${time}`) || [];
              return (
                <div key={`${day}-${time}`} className="bg-white p-1 min-h-[60px]">
                  {cellSlots.map(renderSlotBlock)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  // --- Mobile: stacked by day ---
  const renderMobile = () => {
    const daysWithSlots = DAYS.filter((day) => slots.some((s) => s.meetingDay === day));

    return (
      <div className="md:hidden space-y-4">
        {daysWithSlots.map((day) => {
          const daySlots = slots
            .filter((s) => s.meetingDay === day)
            .sort((a, b) => parseTimeToMinutes(a.meetingTime) - parseTimeToMinutes(b.meetingTime));

          return (
            <div key={day}>
              <h3 className="font-semibold text-sm mb-2">{day}</h3>
              <div className="space-y-1.5">
                {daySlots.map((slot) => {
                  const isSelected = selectedSlotId === slot.id;
                  const isCompatible = compatibleSlotIds?.has(slot.id);
                  const isMultiSelected = multiSelectedIds?.has(slot.id);
                  const inMultiMode = multiEligibleIds !== undefined && multiEligibleIds.size > 0;
                  const isDualSlotType = slot.groupSizeType === 'small' || slot.groupSizeType === 'one_on_one';
                  const clickable = interactive && (
                    !slot.isWindowClosed &&
                    (
                      (inMultiMode && multiEligibleIds?.has(slot.id)) ||
                      (slot.isFull ? slot.groupSizeType === 'large' : (!isDualSlotType || !selectedSlotId || isSelected || isCompatible))
                    )
                  );

                  return (
                    <button
                      key={`${slot.id}-${slot.meetingDay}-m`}
                      onClick={() => clickable && onSlotClick?.(slot)}
                      disabled={!clickable}
                      className={`w-full text-left rounded border p-3 text-sm transition-colors ${getSlotStyle(slot)}`}
                    >
                      <div className="flex justify-between items-center">
                        <span>
                          {isMultiSelected && <span className="text-amber-700 mr-1">&#10003;</span>}
                          <span className="font-medium">{formatTimeForTz(slot.meetingTime)}</span>
                          {' — '}
                          <span className="font-bold">{groupSizeLabel(slot.groupSizeType)}</span>
                          {slot.subject && (
                            <>
                              {' '}
                              <span>{subjectShort(slot.subject)}</span>
                            </>
                          )}
                          {slot.level && slot.level !== 'all_levels' && (
                            <span className="text-gray-500"> ({slot.level})</span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          {isMultiSelected ? (
                            <span className="text-[10px] font-medium text-amber-700">Selected</span>
                          ) : slot.isFull && !slot.isWindowClosed && !hideWaitlist ? (
                            <span className="text-[10px] font-medium text-red-500">Full</span>
                          ) : null}
                          <span className={`text-xs font-medium ${slot.isWindowClosed ? 'text-gray-400' : slot.isFull ? 'text-red-500' : 'text-green-700'}`}>
                            {statusText(slot)}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (slots.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No classes to display.
      </div>
    );
  }

  return (
    <div>
      {/* Legend + timezone toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-blue-400 border border-blue-500" />
            Small Group
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-slate-200 p-0.5">
          <button
            onClick={() => setTimezone('EST')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              timezone === 'EST' ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            EST
          </button>
          <button
            onClick={() => setTimezone('PST')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              timezone === 'PST' ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            PST
          </button>
        </div>
      </div>

      {renderDesktop()}
      {renderMobile()}
    </div>
  );
}
