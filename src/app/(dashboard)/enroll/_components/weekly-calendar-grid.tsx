'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface CalendarSlot {
  id: string;
  name: string | null;
  subject: string;
  level: string;
  groupSizeType: 'small' | 'one_on_one';
  meetingDay: string;
  meetingTime: string;
  capacity: number;
  enrolled: number;
  isFull: boolean;
  enrollmentWindowStart?: string | null;
  enrollmentWindowEnd?: string | null;
  isWindowClosed?: boolean;
}

// --- Time helpers ---

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseTimeToMinutes(raw: string): number {
  // Handle "HH:MM" (24h) or "H:MM AM/PM" (12h)
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

function subjectShort(subject: string): string {
  switch (subject) {
    case 'digital_rw': return 'R&W';
    case 'digital_math': return 'Math';
    case 'digital_rw_math': return 'R&W+Math';
    default: return subject;
  }
}

// --- Component ---

export default function WeeklyCalendarGrid({ slots }: { slots: CalendarSlot[] }) {
  const router = useRouter();
  const [selectedSlot1, setSelectedSlot1] = useState<CalendarSlot | null>(null);

  // Unique sorted times
  const uniqueTimes = [...new Set(slots.map((s) => s.meetingTime))].sort(
    (a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b)
  );

  // Build lookup: day+time -> slots
  const cellMap = new Map<string, CalendarSlot[]>();
  slots.forEach((s) => {
    const key = `${s.meetingDay}|${s.meetingTime}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key)!.push(s);
  });

  const isUnavailable = (slot: CalendarSlot) => slot.isFull || !!slot.isWindowClosed;

  const isCompatible = (slot: CalendarSlot) =>
    selectedSlot1 &&
    slot.groupSizeType === 'small' &&
    slot.subject === selectedSlot1.subject &&
    slot.level === selectedSlot1.level &&
    slot.id !== selectedSlot1.id &&
    !isUnavailable(slot);

  const handleClick = (slot: CalendarSlot) => {
    if (isUnavailable(slot)) return;

    if (slot.groupSizeType === 'one_on_one') {
      router.push(`/enroll/${slot.id}`);
      return;
    }

    // SG flow
    if (!selectedSlot1) {
      setSelectedSlot1(slot);
    } else if (selectedSlot1.id === slot.id) {
      setSelectedSlot1(null);
    } else if (isCompatible(slot)) {
      router.push(`/enroll/${selectedSlot1.id}?slot2=${slot.id}`);
    }
  };

  const getSlotStyle = (slot: CalendarSlot) => {
    const isSelected = selectedSlot1?.id === slot.id;

    if (slot.groupSizeType === 'one_on_one') {
      if (isUnavailable(slot)) return 'bg-gray-100 text-slate-400 border-gray-200 cursor-default';
      return 'bg-success-light border-green-300 hover:bg-green-100 cursor-pointer';
    }

    // SG
    if (isUnavailable(slot)) return 'bg-blue-50/50 text-slate-400 border-gray-200 cursor-default';
    if (isSelected) return 'bg-blue-200 border-blue-500 ring-2 ring-blue-400 cursor-pointer';

    // If we have a slot1 selected, dim incompatible slots
    if (selectedSlot1 && !isCompatible(slot)) {
      return 'bg-slate-50 text-slate-400 border-gray-200 cursor-default';
    }

    return 'bg-blue-50 border-blue-300 hover:bg-blue-100 cursor-pointer';
  };

  const renderSlotBlock = (slot: CalendarSlot) => {
    const unavailable = isUnavailable(slot);
    const clickable =
      !unavailable &&
      (slot.groupSizeType === 'one_on_one' ||
        !selectedSlot1 ||
        selectedSlot1.id === slot.id ||
        isCompatible(slot));

    const statusText = () => {
      if (slot.isWindowClosed) return 'Enrollment Closed';
      if (slot.isFull) return slot.groupSizeType === 'one_on_one' ? 'Booked' : `${slot.enrolled}/${slot.capacity} spots`;
      return slot.groupSizeType === 'one_on_one' ? 'Available' : `${slot.enrolled}/${slot.capacity} spots`;
    };

    return (
      <button
        key={slot.id}
        onClick={() => clickable && handleClick(slot)}
        disabled={!clickable}
        className={`block w-full text-left text-xs rounded border p-1.5 mb-1 last:mb-0 transition-colors ${getSlotStyle(slot)}`}
      >
        <span className="font-semibold">{slot.groupSizeType === 'one_on_one' ? '1:1' : subjectShort(slot.subject)}</span>
        <span className="block">{statusText()}</span>
        {!unavailable && slot.enrollmentWindowStart && slot.enrollmentWindowEnd && (
          <span className="block text-[10px] text-slate-500">Starts {slot.enrollmentWindowStart} – {slot.enrollmentWindowEnd}</span>
        )}
      </button>
    );
  };

  // --- Desktop grid ---
  const renderDesktop = () => (
    <div className="hidden sm:block overflow-x-auto">
      <div
        className="grid gap-px bg-gray-200 rounded-lg overflow-hidden"
        style={{
          gridTemplateColumns: `80px repeat(${DAYS.length}, minmax(100px, 1fr))`,
        }}
      >
        {/* Header row */}
        <div className="bg-slate-50 p-2 text-xs font-medium text-slate-500" />
        {DAYS.map((day) => (
          <div key={day} className="bg-slate-50 p-2 text-xs font-semibold text-center">
            {day.slice(0, 3)}
          </div>
        ))}

        {/* Time rows */}
        {uniqueTimes.map((time) => (
          <>
            <div
              key={`label-${time}`}
              className="bg-white p-2 text-xs text-slate-500 font-medium flex items-start"
            >
              {formatTime12h(time)}
            </div>
            {DAYS.map((day) => {
              const cellSlots = cellMap.get(`${day}|${time}`) || [];
              return (
                <div key={`${day}-${time}`} className="bg-white p-1 min-h-[60px]">
                  {cellSlots.map(renderSlotBlock)}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );

  // --- Mobile: stacked by day ---
  const renderMobile = () => {
    const daysWithSlots = DAYS.filter((day) => slots.some((s) => s.meetingDay === day));

    return (
      <div className="sm:hidden space-y-4">
        {daysWithSlots.map((day) => {
          const daySlots = slots
            .filter((s) => s.meetingDay === day)
            .sort((a, b) => parseTimeToMinutes(a.meetingTime) - parseTimeToMinutes(b.meetingTime));

          return (
            <div key={day}>
              <h3 className="font-semibold text-sm mb-2">{day}</h3>
              <div className="space-y-2">
                {daySlots.map((slot) => {
                  const unavailable = isUnavailable(slot);
                  const mobileStatus = slot.isWindowClosed
                    ? 'Enrollment Closed'
                    : slot.groupSizeType === 'one_on_one'
                      ? slot.isFull ? 'Booked' : 'Available'
                      : `${slot.enrolled}/${slot.capacity} spots`;
                  return (
                    <button
                      key={slot.id}
                      onClick={() => !unavailable && handleClick(slot)}
                      disabled={unavailable && !selectedSlot1}
                      className={`w-full text-left rounded border p-3 text-sm transition-colors ${getSlotStyle(slot)}`}
                    >
                      <div className="flex justify-between items-center">
                        <span>
                          <span className="font-medium">{formatTime12h(slot.meetingTime)}</span>
                          {' — '}
                          {slot.groupSizeType === 'one_on_one' ? (
                            <span>1:1</span>
                          ) : (
                            <span>{subjectShort(slot.subject)}</span>
                          )}
                        </span>
                        <span className="text-xs">{mobileStatus}</span>
                      </div>
                      {!unavailable && slot.enrollmentWindowStart && slot.enrollmentWindowEnd && (
                        <p className="text-xs text-slate-500 mt-1">Starts {slot.enrollmentWindowStart} – {slot.enrollmentWindowEnd}</p>
                      )}
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

  return (
    <div>
      {/* Selection banner */}
      {selectedSlot1 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-blue-100 border border-blue-300 p-3 text-sm">
          <span>
            <strong>Slot 1:</strong> {selectedSlot1.meetingDay} at {formatTime12h(selectedSlot1.meetingTime)} —{' '}
            {subjectShort(selectedSlot1.subject)}. Pick your second slot.
          </span>
          <button
            onClick={() => setSelectedSlot1(null)}
            className="ml-auto text-blue-700 underline hover:text-blue-900 text-xs"
          >
            Clear
          </button>
        </div>
      )}

      {renderDesktop()}
      {renderMobile()}
    </div>
  );
}
