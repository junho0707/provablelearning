/**
 * Small Group (SG) + Summer Large Group (LG) business-logic checkpoints.
 *
 * These are the PYRAMID BASE: invariants enforced at the pure-logic layer.
 * Each test locks in a specific contract that the system depends on.
 * If any of these break, the corresponding prod checks will fail.
 */

import { describe, it, expect } from 'vitest';
import {
  computeSessionDates,
  computeEnrollmentSessions,
  computeLgSessions,
} from '@/lib/scheduling/session-dates';
import {
  PRICES,
  SESSIONS_PER_SLOT,
  SESSION_DURATION_HOURS,
  GROUP_SIZE_RANGES,
  PAYMENT_DEADLINE_DAYS_AFTER_START,
  PHASE_1_DAYS_BEFORE_START,
  getPriceForEnrollment,
  formatSubjectCategory,
} from '@/lib/constants';

// ---------------------------------------------------------------------------
// 1. Pricing invariants  — if these drift, Stripe charges the wrong amount.
// ---------------------------------------------------------------------------
describe('SG/LG pricing contract', () => {
  it('SG is $300/mo in cents', () => {
    expect(PRICES.small).toBe(30000);
    expect(getPriceForEnrollment('small')).toBe(30000);
  });

  it('LG is $20/mo in cents', () => {
    expect(PRICES.large).toBe(2000);
    expect(getPriceForEnrollment('large')).toBe(2000);
  });

  it('1:1 is $800/mo in cents', () => {
    expect(PRICES.one_on_one).toBe(80000);
    expect(getPriceForEnrollment('one_on_one')).toBe(80000);
  });

  it('unknown group size falls back to SG (prevents free enrollments)', () => {
    expect(getPriceForEnrollment('unknown')).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Capacity ranges  — must match reserve_seat + class creation validator.
// ---------------------------------------------------------------------------
describe('Capacity ranges per group size', () => {
  it('SG capacity is 1–3', () => {
    expect(GROUP_SIZE_RANGES.small).toEqual({ min: 1, max: 3 });
  });
  it('LG capacity is 10–20', () => {
    expect(GROUP_SIZE_RANGES.large).toEqual({ min: 10, max: 20 });
  });
  it('1:1 capacity is exactly 1', () => {
    expect(GROUP_SIZE_RANGES.one_on_one).toEqual({ min: 1, max: 1 });
  });
});

// ---------------------------------------------------------------------------
// 3. Session count + duration  — drives computeEnrollmentSessions.
// ---------------------------------------------------------------------------
describe('Session configuration', () => {
  it('each slot has 4 sessions/month', () => {
    expect(SESSIONS_PER_SLOT).toBe(4);
  });
  it('every group size session is 1.5 hours', () => {
    expect(SESSION_DURATION_HOURS.small).toBe(1.5);
    expect(SESSION_DURATION_HOURS.large).toBe(1.5);
    expect(SESSION_DURATION_HOURS.one_on_one).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// 4. SG dual-slot interleaving  — odd→slot_1, even→slot_2, 8 total.
// ---------------------------------------------------------------------------
describe('SG dual-slot session layout', () => {
  it('produces 8 sessions for 2 distinct meeting days', () => {
    const sessions = computeEnrollmentSessions(
      '2026-04-06', // Monday
      { classId: 'mon', meetingDay: 'Monday' },
      { classId: 'thu', meetingDay: 'Thursday' }
    );
    expect(sessions).toHaveLength(8);
  });

  it('assigns odd session numbers to slot_1, even to slot_2', () => {
    const sessions = computeEnrollmentSessions(
      '2026-04-06',
      { classId: 'mon', meetingDay: 'Monday' },
      { classId: 'thu', meetingDay: 'Thursday' }
    );
    const slot1Sessions = sessions.filter((s) => s.classId === 'mon');
    const slot2Sessions = sessions.filter((s) => s.classId === 'thu');
    expect(slot1Sessions.map((s) => s.sessionNumber).sort()).toEqual([1, 3, 5, 7]);
    expect(slot2Sessions.map((s) => s.sessionNumber).sort()).toEqual([2, 4, 6, 8]);
  });

  it('sessions are sorted chronologically after interleaving', () => {
    const sessions = computeEnrollmentSessions(
      '2026-04-06',
      { classId: 'mon', meetingDay: 'Monday' },
      { classId: 'thu', meetingDay: 'Thursday' }
    );
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i].date.getTime()).toBeGreaterThanOrEqual(
        sessions[i - 1].date.getTime()
      );
    }
  });

  it('single-slot (1:1 legacy) produces 4 sessions numbered 1–4', () => {
    const sessions = computeEnrollmentSessions(
      '2026-04-06',
      { classId: 'mon', meetingDay: 'Monday' }
    );
    expect(sessions).toHaveLength(4);
    expect(sessions.map((s) => s.sessionNumber)).toEqual([1, 2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// 5. LG 2-day layout  — both meeting days on same class, 8 sessions.
// ---------------------------------------------------------------------------
describe('LG dual-meeting-day session layout', () => {
  it('produces 8 sessions across two meeting days', () => {
    const sessions = computeLgSessions('2026-06-01', 'lg-1', 'Monday', 'Wednesday');
    expect(sessions).toHaveLength(8);
    expect(sessions.every((s) => s.classId === 'lg-1')).toBe(true);
  });

  it('numbers sessions 1–8 in chronological order', () => {
    const sessions = computeLgSessions('2026-06-01', 'lg-1', 'Monday', 'Wednesday');
    expect(sessions.map((s) => s.sessionNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

// ---------------------------------------------------------------------------
// 6. SG end-date window (mirrors reserve_seat SQL: start + 35 days)
// ---------------------------------------------------------------------------
describe('SG enrollment end-date (flat 35 days) parity', () => {
  function endDate(startISO: string): string {
    const d = new Date(startISO + 'T00:00:00');
    d.setDate(d.getDate() + 35);
    return d.toISOString().slice(0, 10);
  }

  it('Mon Mar 30 → May 4 (+35d)', () => {
    expect(endDate('2026-03-30')).toBe('2026-05-04');
  });
  it('Sat Apr 4 → May 9 (+35d)', () => {
    expect(endDate('2026-04-04')).toBe('2026-05-09');
  });

  it('covers every weekly 4-session sequence regardless of start DOW or meeting day', () => {
    // For any start date and any meeting_day, the 4th weekly session falls at
    // most start + 6 + 21 = +27 days. A 35-day window clears that by 8+ days.
    for (let startOffset = 0; startOffset < 14; startOffset++) {
      const start = new Date('2026-04-06T00:00:00');
      start.setDate(start.getDate() + startOffset);
      const startISO = start.toISOString().slice(0, 10);
      const end = endDate(startISO);

      for (const day of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
        const sessions = computeSessionDates(startISO, day, 4);
        const last = sessions[3].dateStr;
        expect(last <= end).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Payment deadline + drop-phase constants
// ---------------------------------------------------------------------------
describe('Payment + drop-phase constants', () => {
  it('payment deadline = start + 7 days', () => {
    expect(PAYMENT_DEADLINE_DAYS_AFTER_START).toBe(7);
  });

  it('Phase 1 self-serve boundary is 7 days (matches drop_enrollment RPC in migration 00041)', () => {
    expect(PHASE_1_DAYS_BEFORE_START).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 8. Subject-category display (SG/1:1 enrollment-level subject)
// ---------------------------------------------------------------------------
describe('Enrollment subject_category formatting', () => {
  it('formats each DSAT subject', () => {
    expect(formatSubjectCategory('dsat_rw')).toBe('DSAT Reading & Writing');
    expect(formatSubjectCategory('dsat_math')).toBe('DSAT Math');
    expect(formatSubjectCategory('dsat_rw_math')).toBe('DSAT Reading, Writing & Math');
  });
  it('appends detail for general_math', () => {
    expect(formatSubjectCategory('general_math', 'Algebra 2')).toBe('School Math: Algebra 2');
    expect(formatSubjectCategory('general_math', null)).toBe('School Math');
  });
  it('returns empty string for null', () => {
    expect(formatSubjectCategory(null)).toBe('');
  });
});
