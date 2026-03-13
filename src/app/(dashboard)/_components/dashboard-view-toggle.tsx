'use client';

import { useState, useMemo } from 'react';
import { formatTime } from '@/lib/constants';

interface SessionEvent {
  studentName: string;
  className: string | null;
  meetingDay: string;
  meetingTime: string;
  sessionNumber: number;
  sessionDate: string;
  isCancelled: boolean;
  isMakeup: boolean;
  isPast: boolean;
  googleMeetLink: string | null;
  /** For cancelled sessions: date of the makeup (if booked) */
  makeupDate?: string | null;
  /** For makeup sessions: date of the original cancelled session */
  originalDate?: string | null;
}

interface DashboardViewToggleProps {
  children: React.ReactNode;
  sessions: SessionEvent[];
  /** Label for the non-calendar tab. Defaults to "By Student". */
  listLabel?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeToMin(raw: string): number {
  const ampmMatch = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  const m24 = raw.match(/^(\d{1,2}):(\d{2})/);
  if (m24) return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
  return 0;
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks: Date[][] = [];
  let week: Date[] = [];

  for (let i = 0; i < startDay; i++) {
    week.push(new Date(year, month, 1 - startDay + i));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    week.push(new Date(year, month, day));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    let trailing = 1;
    while (week.length < 7) {
      week.push(new Date(year, month + 1, trailing++));
    }
    weeks.push(week);
  }
  return weeks;
}

function useSessionIndex(sessions: SessionEvent[]) {
  return useMemo(() => {
    const byDate: Record<string, SessionEvent[]> = {};
    for (const s of sessions) {
      if (!byDate[s.sessionDate]) byDate[s.sessionDate] = [];
      byDate[s.sessionDate].push(s);
    }
    for (const k of Object.keys(byDate)) {
      byDate[k].sort((a, b) => timeToMin(a.meetingTime) - timeToMin(b.meetingTime));
    }
    return byDate;
  }, [sessions]);
}

function CalendarView({ sessions }: { sessions: SessionEvent[] }) {
  const now = new Date();
  const [monthOffset, setMonthOffset] = useState(0);
  const viewYear = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getFullYear();
  const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getMonth();
  const todayStr = toDateStr(new Date());
  const byDate = useSessionIndex(sessions);

  const weeks = getMonthGrid(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div>
      {/* Navigator */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sm:px-6">
        <button onClick={() => setMonthOffset((o) => o - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-navy-700 hover:bg-navy-50">&larr;</button>
        <p className="text-sm font-semibold text-navy-900">{monthLabel}</p>
        <button onClick={() => setMonthOffset((o) => o + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-navy-700 hover:bg-navy-50">&rarr;</button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-slate-100">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="px-1 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{wd}</p>
              </div>
            ))}
          </div>

          {/* Week rows */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-b-0 border-slate-50">
              {week.map((d, di) => {
                const ds = toDateStr(d);
                const isToday = ds === todayStr;
                const isCurrentMonth = d.getMonth() === viewMonth;
                const daySessions = byDate[ds] || [];
                const hasSession = daySessions.length > 0;

                return (
                  <div
                    key={di}
                    className={`border-r last:border-r-0 border-slate-50 min-h-[80px] p-1 ${
                      isToday ? 'bg-navy-50/30' : !isCurrentMonth ? 'bg-slate-50/50' : ''
                    }`}
                  >
                    <div className="flex justify-end mb-0.5">
                      <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday
                          ? 'bg-navy-900 text-white'
                          : !isCurrentMonth
                          ? 'text-slate-300'
                          : hasSession
                          ? 'text-navy-900 font-semibold'
                          : 'text-slate-400'
                      }`}>
                        {d.getDate()}
                      </span>
                    </div>
                    {daySessions.map((s, j) => {
                      const color = s.isCancelled
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : s.isMakeup
                        ? 'bg-purple-50 border-purple-200 text-purple-800'
                        : s.isPast
                        ? 'bg-slate-50 text-slate-400 border-slate-100'
                        : 'bg-blue-50 border-blue-200 text-navy-900';
                      return (
                        <div key={`${ds}-${s.sessionNumber}-${j}`} className={`rounded px-1.5 py-1 mb-0.5 text-[10px] leading-tight border ${color}`}>
                          <p className="font-semibold truncate">{formatTime(s.meetingTime)}</p>
                          <p className="truncate">{s.studentName}</p>
                          {s.isCancelled && (
                            <p className="truncate opacity-70">
                              {s.makeupDate ? `Cancelled → ${shortDate(s.makeupDate)}` : 'Cancelled'}
                            </p>
                          )}
                          {s.isMakeup && (
                            <p className="truncate opacity-70">
                              {s.originalDate ? `Makeup for ${shortDate(s.originalDate)}` : 'Makeup'}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardViewToggle({ children, sessions, listLabel = 'By Student' }: DashboardViewToggleProps) {
  const [view, setView] = useState<'students' | 'calendar'>('students');

  return (
    <div>
      <div className="flex items-center gap-1 mb-4 rounded-lg bg-slate-100 p-1 w-fit">
        <button
          onClick={() => setView('students')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            view === 'students' ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {listLabel}
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            view === 'calendar' ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Calendar
        </button>
      </div>

      {view === 'students' ? (
        children
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <CalendarView sessions={sessions} />
        </div>
      )}
    </div>
  );
}
