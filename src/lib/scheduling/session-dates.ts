const DAY_MAP: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export interface SessionInfo {
  sessionNumber: number;
  date: Date;
  dateStr: string; // YYYY-MM-DD
  isPast: boolean;
}

/**
 * Compute session dates for a module, mirroring the SQL compute_session_date function.
 * Returns an array of { sessionNumber, date, isPast } for each of the 8 sessions.
 */
export function computeSessionDates(
  moduleStartDate: string, // YYYY-MM-DD
  meetingDay: string,       // e.g. "Monday"
  count: number = 8
): SessionInfo[] {
  const targetDow = DAY_MAP[meetingDay];
  if (targetDow === undefined) return [];

  const start = new Date(moduleStartDate + 'T00:00:00');
  const currentDow = start.getDay();
  const offset = (targetDow - currentDow + 7) % 7;
  const firstDate = new Date(start);
  firstDate.setDate(firstDate.getDate() + offset);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sessions: SessionInfo[] = [];
  for (let i = 0; i < count; i++) {
    const sessionDate = new Date(firstDate);
    sessionDate.setDate(sessionDate.getDate() + i * 7);
    sessions.push({
      sessionNumber: i + 1,
      date: sessionDate,
      dateStr: sessionDate.toISOString().split('T')[0],
      isPast: sessionDate <= today,
    });
  }

  return sessions;
}
