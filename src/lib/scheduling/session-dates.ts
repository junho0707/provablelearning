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
  classId?: string;
}

/**
 * Compute session dates for a single slot, mirroring the SQL compute_session_date function.
 * Returns an array of { sessionNumber, date, isPast } for each of the 4 sessions per slot.
 */
export function computeSessionDates(
  startDate: string, // YYYY-MM-DD
  meetingDay: string, // e.g. "Monday"
  count: number = 4
): SessionInfo[] {
  const targetDow = DAY_MAP[meetingDay];
  if (targetDow === undefined) return [];

  const start = new Date(startDate + 'T00:00:00');
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

/**
 * Compute all sessions for an enrollment, interleaving slots.
 * 3-slot: round-robin 1,4,7,10→slot_1; 2,5,8,11→slot_2; 3,6,9,12→slot_3
 * 2-slot: odd (1,3,5,7) → slot_1, even (2,4,6,8) → slot_2
 * 1-slot: sessions 1-4
 */
export function computeEnrollmentSessions(
  startDate: string,
  slot1: { classId: string; meetingDay: string },
  slot2?: { classId: string; meetingDay: string } | null,
  slot3?: { classId: string; meetingDay: string } | null
): SessionInfo[] {
  const slot1Sessions = computeSessionDates(startDate, slot1.meetingDay, 4);

  if (!slot2) {
    // 1-slot: sessions numbered 1-4
    return slot1Sessions.map((s, i) => ({
      ...s,
      sessionNumber: i + 1,
      classId: slot1.classId,
    }));
  }

  const slot2Sessions = computeSessionDates(startDate, slot2.meetingDay, 4);

  if (slot3) {
    // 3-slot: 12 sessions, round-robin
    const slot3Sessions = computeSessionDates(startDate, slot3.meetingDay, 4);
    const combined: SessionInfo[] = [];
    for (let i = 0; i < 4; i++) {
      combined.push({
        ...slot1Sessions[i],
        sessionNumber: i * 3 + 1, // 1, 4, 7, 10
        classId: slot1.classId,
      });
      combined.push({
        ...slot2Sessions[i],
        sessionNumber: i * 3 + 2, // 2, 5, 8, 11
        classId: slot2.classId,
      });
      combined.push({
        ...slot3Sessions[i],
        sessionNumber: i * 3 + 3, // 3, 6, 9, 12
        classId: slot3.classId,
      });
    }
    combined.sort((a, b) => a.date.getTime() - b.date.getTime());
    return combined;
  }

  // 2-slot: interleave odd → slot_1, even → slot_2
  const combined: SessionInfo[] = [];
  for (let i = 0; i < 4; i++) {
    combined.push({
      ...slot1Sessions[i],
      sessionNumber: i * 2 + 1, // 1, 3, 5, 7
      classId: slot1.classId,
    });
    combined.push({
      ...slot2Sessions[i],
      sessionNumber: i * 2 + 2, // 2, 4, 6, 8
      classId: slot2.classId,
    });
  }

  // Sort chronologically
  combined.sort((a, b) => a.date.getTime() - b.date.getTime());
  return combined;
}

/**
 * Compute sessions for an LG class with 2 meeting days (built into one class).
 * Interleaves day 1 and day 2 → 8 sessions total, sorted chronologically.
 */
export function computeLgSessions(
  startDate: string,
  classId: string,
  meetingDay1: string,
  meetingDay2: string
): SessionInfo[] {
  const day1Sessions = computeSessionDates(startDate, meetingDay1, 4);
  const day2Sessions = computeSessionDates(startDate, meetingDay2, 4);

  const combined: SessionInfo[] = [];
  for (let i = 0; i < 4; i++) {
    combined.push({
      ...day1Sessions[i],
      sessionNumber: 0, // will be set after sort
      classId,
    });
    combined.push({
      ...day2Sessions[i],
      sessionNumber: 0,
      classId,
    });
  }

  // Sort chronologically, then number
  combined.sort((a, b) => a.date.getTime() - b.date.getTime());
  combined.forEach((s, i) => {
    s.sessionNumber = i + 1;
  });

  return combined;
}
