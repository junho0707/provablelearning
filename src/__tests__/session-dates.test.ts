import { describe, it, expect } from 'vitest';
import {
  computeSessionDates,
  computeEnrollmentSessions,
  computeLgSessions,
} from '@/lib/scheduling/session-dates';

describe('computeSessionDates', () => {
  it('returns empty array for invalid meeting day', () => {
    expect(computeSessionDates('2026-03-30', 'Fooday')).toEqual([]);
  });

  it('computes 4 weekly sessions starting from the first matching day', () => {
    // 2026-03-30 is a Monday → "Monday" should start on 2026-03-30
    const sessions = computeSessionDates('2026-03-30', 'Monday');
    expect(sessions).toHaveLength(4);
    expect(sessions[0].dateStr).toBe('2026-03-30');
    expect(sessions[1].dateStr).toBe('2026-04-06');
    expect(sessions[2].dateStr).toBe('2026-04-13');
    expect(sessions[3].dateStr).toBe('2026-04-20');
  });

  it('session numbers are 1-indexed', () => {
    const sessions = computeSessionDates('2026-03-30', 'Monday');
    expect(sessions.map((s) => s.sessionNumber)).toEqual([1, 2, 3, 4]);
  });

  it('offsets to the next matching day when start is a different DOW', () => {
    // 2026-03-30 is Monday → "Wednesday" should start on 2026-04-01
    const sessions = computeSessionDates('2026-03-30', 'Wednesday');
    expect(sessions[0].dateStr).toBe('2026-04-01');
    expect(sessions[1].dateStr).toBe('2026-04-08');
  });

  it('wraps around when meeting day is before start DOW', () => {
    // 2026-04-01 is Wednesday → "Monday" should start on 2026-04-06 (next Mon)
    const sessions = computeSessionDates('2026-04-01', 'Monday');
    expect(sessions[0].dateStr).toBe('2026-04-06');
  });

  it('starts on the same day if start date matches meeting day', () => {
    // 2026-04-04 is Saturday
    const sessions = computeSessionDates('2026-04-04', 'Saturday');
    expect(sessions[0].dateStr).toBe('2026-04-04');
  });

  it('respects custom count parameter', () => {
    const sessions = computeSessionDates('2026-03-30', 'Monday', 2);
    expect(sessions).toHaveLength(2);
  });

  it('each session is exactly 7 days apart', () => {
    const sessions = computeSessionDates('2026-03-30', 'Tuesday');
    for (let i = 1; i < sessions.length; i++) {
      const diff = sessions[i].date.getTime() - sessions[i - 1].date.getTime();
      expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });

  it('generates consistent dateStr from date object', () => {
    const sessions = computeSessionDates('2026-03-30', 'Monday');
    for (const s of sessions) {
      expect(s.dateStr).toBe(s.date.toISOString().split('T')[0]);
    }
  });
});

describe('computeEnrollmentSessions — 1-slot (LG)', () => {
  it('returns 4 sessions numbered 1-4 with classId', () => {
    const sessions = computeEnrollmentSessions('2026-03-30', {
      classId: 'cls-a',
      meetingDay: 'Monday',
    });
    expect(sessions).toHaveLength(4);
    expect(sessions.map((s) => s.sessionNumber)).toEqual([1, 2, 3, 4]);
    expect(sessions.every((s) => s.classId === 'cls-a')).toBe(true);
  });
});

describe('computeEnrollmentSessions — 2-slot (SG/1:1)', () => {
  it('returns 8 sessions interleaved odd→slot1, even→slot2', () => {
    // Mon & Wed from 2026-03-30
    const sessions = computeEnrollmentSessions(
      '2026-03-30',
      { classId: 'cls-mon', meetingDay: 'Monday' },
      { classId: 'cls-wed', meetingDay: 'Wednesday' }
    );
    expect(sessions).toHaveLength(8);

    // Check slot assignment by session number
    for (const s of sessions) {
      if (s.sessionNumber % 2 === 1) {
        expect(s.classId).toBe('cls-mon'); // odd → slot 1
      } else {
        expect(s.classId).toBe('cls-wed'); // even → slot 2
      }
    }
  });

  it('session numbers are 1-8', () => {
    const sessions = computeEnrollmentSessions(
      '2026-03-30',
      { classId: 'cls-mon', meetingDay: 'Monday' },
      { classId: 'cls-wed', meetingDay: 'Wednesday' }
    );
    const numbers = sessions.map((s) => s.sessionNumber).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('sessions are sorted chronologically', () => {
    const sessions = computeEnrollmentSessions(
      '2026-03-30',
      { classId: 'cls-mon', meetingDay: 'Monday' },
      { classId: 'cls-fri', meetingDay: 'Friday' }
    );
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i].date.getTime()).toBeGreaterThanOrEqual(
        sessions[i - 1].date.getTime()
      );
    }
  });

  it('slot 1 has 4 sessions and slot 2 has 4 sessions', () => {
    const sessions = computeEnrollmentSessions(
      '2026-03-30',
      { classId: 'cls-a', meetingDay: 'Monday' },
      { classId: 'cls-b', meetingDay: 'Thursday' }
    );
    const slotA = sessions.filter((s) => s.classId === 'cls-a');
    const slotB = sessions.filter((s) => s.classId === 'cls-b');
    expect(slotA).toHaveLength(4);
    expect(slotB).toHaveLength(4);
  });
});

describe('computeEnrollmentSessions — 3-slot', () => {
  it('returns 12 sessions with round-robin mapping', () => {
    const sessions = computeEnrollmentSessions(
      '2026-03-30',
      { classId: 'cls-mon', meetingDay: 'Monday' },
      { classId: 'cls-wed', meetingDay: 'Wednesday' },
      { classId: 'cls-fri', meetingDay: 'Friday' }
    );
    expect(sessions).toHaveLength(12);
  });

  it('round-robin: 1,4,7,10→slot1; 2,5,8,11→slot2; 3,6,9,12→slot3', () => {
    const sessions = computeEnrollmentSessions(
      '2026-03-30',
      { classId: 'cls-1', meetingDay: 'Monday' },
      { classId: 'cls-2', meetingDay: 'Wednesday' },
      { classId: 'cls-3', meetingDay: 'Friday' }
    );

    const byNumber = new Map(sessions.map((s) => [s.sessionNumber, s.classId]));
    // Slot 1: sessions 1, 4, 7, 10
    expect(byNumber.get(1)).toBe('cls-1');
    expect(byNumber.get(4)).toBe('cls-1');
    expect(byNumber.get(7)).toBe('cls-1');
    expect(byNumber.get(10)).toBe('cls-1');
    // Slot 2: sessions 2, 5, 8, 11
    expect(byNumber.get(2)).toBe('cls-2');
    expect(byNumber.get(5)).toBe('cls-2');
    expect(byNumber.get(8)).toBe('cls-2');
    expect(byNumber.get(11)).toBe('cls-2');
    // Slot 3: sessions 3, 6, 9, 12
    expect(byNumber.get(3)).toBe('cls-3');
    expect(byNumber.get(6)).toBe('cls-3');
    expect(byNumber.get(9)).toBe('cls-3');
    expect(byNumber.get(12)).toBe('cls-3');
  });

  it('sessions are sorted chronologically', () => {
    const sessions = computeEnrollmentSessions(
      '2026-03-30',
      { classId: 'cls-1', meetingDay: 'Monday' },
      { classId: 'cls-2', meetingDay: 'Wednesday' },
      { classId: 'cls-3', meetingDay: 'Friday' }
    );
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i].date.getTime()).toBeGreaterThanOrEqual(
        sessions[i - 1].date.getTime()
      );
    }
  });

  it('each slot gets exactly 4 sessions', () => {
    const sessions = computeEnrollmentSessions(
      '2026-03-30',
      { classId: 'A', meetingDay: 'Tuesday' },
      { classId: 'B', meetingDay: 'Thursday' },
      { classId: 'C', meetingDay: 'Saturday' }
    );
    expect(sessions.filter((s) => s.classId === 'A')).toHaveLength(4);
    expect(sessions.filter((s) => s.classId === 'B')).toHaveLength(4);
    expect(sessions.filter((s) => s.classId === 'C')).toHaveLength(4);
  });
});

describe('computeLgSessions', () => {
  it('returns 8 sessions from 2 meeting days', () => {
    const sessions = computeLgSessions('2026-03-30', 'cls-lg', 'Monday', 'Wednesday');
    expect(sessions).toHaveLength(8);
  });

  it('all sessions have the same classId', () => {
    const sessions = computeLgSessions('2026-03-30', 'cls-lg', 'Monday', 'Wednesday');
    expect(sessions.every((s) => s.classId === 'cls-lg')).toBe(true);
  });

  it('sessions are numbered 1-8 after chronological sort', () => {
    const sessions = computeLgSessions('2026-03-30', 'cls-lg', 'Monday', 'Wednesday');
    expect(sessions.map((s) => s.sessionNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('sessions alternate between the two days', () => {
    // 2026-03-30 is Monday, Wed is Apr 1
    const sessions = computeLgSessions('2026-03-30', 'cls-lg', 'Monday', 'Wednesday');
    // First session should be Monday Mar 30
    expect(sessions[0].dateStr).toBe('2026-03-30');
    // Second should be Wednesday Apr 1
    expect(sessions[1].dateStr).toBe('2026-04-01');
    // Third should be Monday Apr 6
    expect(sessions[2].dateStr).toBe('2026-04-06');
  });

  it('sessions are strictly chronologically ordered', () => {
    const sessions = computeLgSessions('2026-03-30', 'cls-lg', 'Friday', 'Tuesday');
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i].date.getTime()).toBeGreaterThan(
        sessions[i - 1].date.getTime()
      );
    }
  });
});
