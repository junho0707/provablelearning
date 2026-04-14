import { describe, it, expect } from 'vitest';
import {
  PRICES,
  GROUP_SIZE_RANGES,
  SESSION_DURATION_HOURS,
  SESSIONS_PER_SLOT,
  PENDING_ENROLLMENT_TTL_MINUTES,
  WAITLIST_CLAIM_WINDOW_HOURS,
  PHASE_1_DAYS_BEFORE_START,
  PAYMENT_DEADLINE_DAYS_AFTER_START,
  MAX_REENROLL_PER_SUBJECT,
  ENROLLMENT_PERIOD,
  getPriceForEnrollment,
  formatSubject,
  formatSubjectShort,
  formatSubjectCategory,
  formatTime,
  formatSchedule,
  dayIndex,
} from '@/lib/constants';
import { getPriceForGroupSize, formatPrice } from '@/lib/stripe/prices';

// =====================================================================
// Constants correctness
// =====================================================================
describe('Business Constants', () => {
  it('prices match business model', () => {
    expect(PRICES.large).toBe(2000);       // $20/mo
    expect(PRICES.small).toBe(30000);      // $300/mo
    expect(PRICES.one_on_one).toBe(80000); // $800/mo
  });

  it('group size ranges are correct', () => {
    expect(GROUP_SIZE_RANGES.one_on_one).toEqual({ min: 1, max: 1 });
    expect(GROUP_SIZE_RANGES.small).toEqual({ min: 1, max: 3 });
    expect(GROUP_SIZE_RANGES.large).toEqual({ min: 10, max: 20 });
  });

  it('session durations are 1.5hr for all types', () => {
    expect(SESSION_DURATION_HOURS.one_on_one).toBe(1.5);
    expect(SESSION_DURATION_HOURS.small).toBe(1.5);
    expect(SESSION_DURATION_HOURS.large).toBe(1.5);
  });

  it('4 sessions per slot', () => {
    expect(SESSIONS_PER_SLOT).toBe(4);
  });

  it('pending enrollment TTL is 30 min (matches Stripe)', () => {
    expect(PENDING_ENROLLMENT_TTL_MINUTES).toBe(30);
  });

  it('waitlist claim window is 24 hours', () => {
    expect(WAITLIST_CLAIM_WINDOW_HOURS).toBe(24);
  });

  it('phase 1 self-serve boundary is 7 days before start (matches drop_enrollment RPC)', () => {
    expect(PHASE_1_DAYS_BEFORE_START).toBe(7);
  });

  it('payment deadline is 7 days after start', () => {
    expect(PAYMENT_DEADLINE_DAYS_AFTER_START).toBe(7);
  });

  it('max re-enrollment per subject is 3', () => {
    expect(MAX_REENROLL_PER_SUBJECT).toBe(3);
  });

  it('enrollment period has valid date range', () => {
    const start = new Date(ENROLLMENT_PERIOD.start);
    const end = new Date(ENROLLMENT_PERIOD.end);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });
});

// =====================================================================
// getPriceForEnrollment
// =====================================================================
describe('getPriceForEnrollment', () => {
  it('returns correct prices for each group size', () => {
    expect(getPriceForEnrollment('large')).toBe(2000);
    expect(getPriceForEnrollment('small')).toBe(30000);
    expect(getPriceForEnrollment('one_on_one')).toBe(80000);
  });

  it('defaults to small price for unknown type', () => {
    expect(getPriceForEnrollment('unknown')).toBe(PRICES.small);
  });
});

// =====================================================================
// Stripe price utilities
// =====================================================================
describe('getPriceForGroupSize', () => {
  it('delegates to getPriceForEnrollment', () => {
    expect(getPriceForGroupSize('one_on_one')).toBe(80000);
    expect(getPriceForGroupSize('small')).toBe(30000);
    expect(getPriceForGroupSize('large')).toBe(2000);
  });
});

describe('formatPrice', () => {
  it('formats cents to dollar string', () => {
    expect(formatPrice(80000)).toBe('$800.00');
    expect(formatPrice(30000)).toBe('$300.00');
    expect(formatPrice(2000)).toBe('$20.00');
    expect(formatPrice(0)).toBe('$0.00');
    expect(formatPrice(99)).toBe('$0.99');
    expect(formatPrice(150)).toBe('$1.50');
  });
});

// =====================================================================
// Subject formatting
// =====================================================================
describe('formatSubject', () => {
  it('formats known subjects', () => {
    expect(formatSubject('digital_rw')).toBe('DSAT Reading & Writing');
    expect(formatSubject('digital_math')).toBe('DSAT Math');
    expect(formatSubject('digital_rw_math')).toBe('DSAT Reading, Writing & Math');
  });

  it('returns empty string for null', () => {
    expect(formatSubject(null)).toBe('');
  });

  it('returns raw value for unknown subject', () => {
    expect(formatSubject('physics')).toBe('physics');
  });
});

describe('formatSubjectShort', () => {
  it('formats known subjects to short labels', () => {
    expect(formatSubjectShort('digital_rw')).toBe('Digital SAT R&W');
    expect(formatSubjectShort('digital_math')).toBe('Digital SAT Math');
    expect(formatSubjectShort('digital_rw_math')).toBe('Digital SAT R&W + Math');
  });

  it('returns empty string for null', () => {
    expect(formatSubjectShort(null)).toBe('');
  });
});

describe('formatSubjectCategory', () => {
  it('formats enrollment subject categories', () => {
    expect(formatSubjectCategory('dsat_rw')).toBe('DSAT Reading & Writing');
    expect(formatSubjectCategory('dsat_math')).toBe('DSAT Math');
    expect(formatSubjectCategory('dsat_rw_math')).toBe('DSAT Reading, Writing & Math');
  });

  it('handles general_math with detail', () => {
    expect(formatSubjectCategory('general_math', 'Algebra 2')).toBe('School Math: Algebra 2');
    expect(formatSubjectCategory('general_math', null)).toBe('School Math');
    expect(formatSubjectCategory('general_math')).toBe('School Math');
  });

  it('returns empty string for null', () => {
    expect(formatSubjectCategory(null)).toBe('');
  });

  it('returns raw value for unknown category', () => {
    expect(formatSubjectCategory('chemistry')).toBe('chemistry');
  });
});

// =====================================================================
// Time formatting
// =====================================================================
describe('formatTime', () => {
  it('converts 24h to 12h AM/PM', () => {
    expect(formatTime('09:00:00')).toBe('9:00 AM');
    expect(formatTime('15:00:00')).toBe('3:00 PM');
    expect(formatTime('12:00:00')).toBe('12:00 PM');
    expect(formatTime('00:00:00')).toBe('12:00 AM');
    expect(formatTime('23:59:00')).toBe('11:59 PM');
  });

  it('handles short 24h format (HH:MM)', () => {
    expect(formatTime('15:00')).toBe('3:00 PM');
    expect(formatTime('09:30')).toBe('9:30 AM');
  });

  it('passes through already-formatted 12h strings', () => {
    expect(formatTime('3:30 PM')).toBe('3:30 PM');
    expect(formatTime('11:00 AM')).toBe('11:00 AM');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatTime(null)).toBe('');
    expect(formatTime(undefined)).toBe('');
    expect(formatTime('')).toBe('');
  });
});

// =====================================================================
// Schedule formatting
// =====================================================================
describe('formatSchedule', () => {
  it('formats single-day schedule', () => {
    const result = formatSchedule({ meeting_day: 'Monday', meeting_time: '15:00:00' });
    expect(result).toBe('Monday at 3:00 PM');
  });

  it('formats 2-day schedule with same time', () => {
    const result = formatSchedule({
      meeting_day: 'Monday',
      meeting_time: '15:00:00',
      meeting_day_2: 'Wednesday',
      meeting_time_2: '15:00:00',
    });
    expect(result).toBe('Monday & Wednesday at 3:00 PM');
  });

  it('formats 2-day schedule with different times', () => {
    const result = formatSchedule({
      meeting_day: 'Monday',
      meeting_time: '09:00:00',
      meeting_day_2: 'Thursday',
      meeting_time_2: '15:00:00',
    });
    expect(result).toBe('Monday at 9:00 AM & Thursday at 3:00 PM');
  });

  it('ignores null second day', () => {
    const result = formatSchedule({
      meeting_day: 'Friday',
      meeting_time: '10:00',
      meeting_day_2: null,
      meeting_time_2: null,
    });
    expect(result).toBe('Friday at 10:00 AM');
  });
});

// =====================================================================
// dayIndex
// =====================================================================
describe('dayIndex', () => {
  it('returns Monday-first ordering', () => {
    expect(dayIndex('Monday')).toBe(0);
    expect(dayIndex('Tuesday')).toBe(1);
    expect(dayIndex('Wednesday')).toBe(2);
    expect(dayIndex('Thursday')).toBe(3);
    expect(dayIndex('Friday')).toBe(4);
    expect(dayIndex('Saturday')).toBe(5);
    expect(dayIndex('Sunday')).toBe(6);
  });

  it('returns 99 for unknown day', () => {
    expect(dayIndex('Funday')).toBe(99);
  });
});
