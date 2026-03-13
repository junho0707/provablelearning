'use client';

export interface SessionPerfCard {
  key: string;
  sessionNumber: number;
  dateLabel: string; // "Mar 5"
  dateStr: string; // "2026-03-05" for sorting
  isPast: boolean;
  isNext: boolean;
  status: 'normal' | 'cancelled' | 'absent' | 'makeup';
  attendance?: boolean; // undefined = no perf log yet
  homeworkCompleted?: boolean;
}

interface SessionPerformanceProps {
  sessions: SessionPerfCard[];
}

export function SessionPerformance({ sessions }: SessionPerformanceProps) {
  const logged = sessions.filter((s) => s.attendance !== undefined);
  const attended = logged.filter((s) => s.attendance).length;
  const hwDone = logged.filter((s) => s.homeworkCompleted).length;
  const totalLogged = logged.length;

  return (
    <div>
      {/* Session cards grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {sessions.map((s) => {
          const hasLog = s.attendance !== undefined;
          let borderClass = 'border-slate-200';
          let bgClass = 'bg-white';

          if (s.status === 'cancelled') {
            borderClass = 'border-red-200';
            bgClass = 'bg-red-50';
          } else if (s.status === 'absent') {
            borderClass = 'border-amber-200';
            bgClass = 'bg-amber-50';
          } else if (s.status === 'makeup') {
            borderClass = 'border-purple-200';
            bgClass = 'bg-purple-50';
          } else if (s.isNext) {
            borderClass = 'border-blue-300';
            bgClass = 'bg-blue-50';
          } else if (s.isPast && !hasLog) {
            bgClass = 'bg-gray-50';
          }

          return (
            <div
              key={s.key}
              className={`rounded-lg border ${borderClass} ${bgClass} px-2 py-3 text-center min-w-0`}
            >
              {/* Session number */}
              <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">
                S{s.sessionNumber}
                {s.status === 'makeup' && ' \u2605'}
              </p>

              {/* Date label */}
              <p
                className={`text-xs font-medium leading-tight ${
                  s.status === 'cancelled'
                    ? 'text-red-400 line-through'
                    : s.status === 'absent'
                    ? 'text-amber-500 line-through'
                    : s.status === 'makeup'
                    ? 'text-purple-700'
                    : s.isNext
                    ? 'text-blue-800 font-semibold'
                    : s.isPast
                    ? 'text-slate-400'
                    : 'text-slate-600'
                }`}
              >
                {s.dateLabel}
              </p>

              {/* Performance: stacked */}
              {hasLog ? (
                <div className="flex flex-col items-center gap-0.5 mt-2 text-[10px] font-medium leading-none">
                  <span className={s.attendance ? 'text-green-600' : 'text-red-500'}>
                    {s.attendance ? '\u2713' : '\u2717'} Att
                  </span>
                  <span className={s.homeworkCompleted ? 'text-green-600' : 'text-red-500'}>
                    {s.homeworkCompleted ? '\u2713' : '\u2717'} HW
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-slate-300">--</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary line */}
      {totalLogged > 0 && (
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          <span>
            Attendance:{' '}
            <span className="font-semibold text-navy-700">
              {attended}/{sessions.length}
            </span>
          </span>
          <span>
            HW:{' '}
            <span className="font-semibold text-navy-700">
              {hwDone}/{sessions.length}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
