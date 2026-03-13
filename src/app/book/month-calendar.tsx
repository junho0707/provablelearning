'use client';

interface MonthCalendarProps {
  availableDates: Record<string, number>; // date string (YYYY-MM-DD) → slot count
  windowEnd?: string | null; // YYYY-MM-DD, max date for navigation
  viewMonth: { year: number; month: number }; // month is 0-indexed
  onMonthChange: (dir: 'prev' | 'next') => void;
  onSelectDate: (dateStr: string) => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthCalendar({
  availableDates,
  windowEnd: windowEndStr,
  viewMonth,
  onMonthChange,
  onSelectDate,
}: MonthCalendarProps) {
  const { year, month } = viewMonth;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateStr(today);

  const now = new Date();
  const canGoPrev = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());

  // Use window end or fallback to 45 days out
  const maxDate = windowEndStr ? new Date(windowEndStr + 'T23:59:59') : new Date();
  if (!windowEndStr) maxDate.setDate(maxDate.getDate() + 45);
  const maxMonth = maxDate.getMonth();
  const maxYear = maxDate.getFullYear();
  const canGoNext = year < maxYear || (year === maxYear && month < maxMonth);

  // Build grid
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onMonthChange('prev')}
          disabled={!canGoPrev}
          className="p-2 rounded-lg text-navy-700 hover:bg-navy-50 disabled:opacity-30 disabled:cursor-default"
          aria-label="Previous month"
        >
          &larr;
        </button>
        <h3 className="font-semibold text-lg text-navy-900">{monthName}</h3>
        <button
          onClick={() => onMonthChange('next')}
          disabled={!canGoNext}
          className="p-2 rounded-lg text-navy-700 hover:bg-navy-50 disabled:opacity-30 disabled:cursor-default"
          aria-label="Next month"
        >
          &rarr;
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-px mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-navy-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="p-2" />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dateObj = new Date(year, month, day);
          const isPast = dateObj < today;
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
          const isToday = dateStr === todayStr;
          const slotCount = availableDates[dateStr] || 0;
          const hasSlots = slotCount > 0;
          const clickable = hasSlots && !isPast;

          return (
            <button
              key={dateStr}
              onClick={() => clickable && onSelectDate(dateStr)}
              disabled={!clickable}
              className={`
                relative p-2 min-h-[52px] rounded-lg text-sm transition-colors text-center
                ${isToday ? 'ring-2 ring-navy-300' : ''}
                ${isPast || isWeekend ? 'text-slate-300 cursor-default' : ''}
                ${hasSlots && !isPast ? 'bg-gold-50 hover:bg-gold-100 cursor-pointer font-medium text-navy-900 border border-gold-200' : ''}
                ${!hasSlots && !isPast && !isWeekend ? 'text-slate-500 cursor-default' : ''}
              `}
            >
              <span>{day}</span>
              {hasSlots && !isPast && (
                <span className="block text-[10px] text-gold-600 mt-0.5">
                  {slotCount} slot{slotCount === 1 ? '' : 's'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
