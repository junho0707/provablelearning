export const PRICES = {
  large: 2000,            // $20.00/mo
  small: 30000,           // $300.00/mo (2x/wk)
  one_on_one: 80000,      // $800.00/mo (2x/wk, 1.5hr sessions)
} as const;

export const GROUP_SIZE_RANGES = {
  one_on_one: { min: 1, max: 1 },
  small: { min: 1, max: 3 },
  large: { min: 10, max: 20 },
} as const;

export const SESSIONS_PER_SLOT = 4;

/** Session duration in hours by group size type */
export const SESSION_DURATION_HOURS = {
  one_on_one: 1.5,
  small: 1.5,
  large: 1.5,
} as const;

export const MAX_REENROLL_PER_SUBJECT = 3;

export const WAITLIST_CLAIM_WINDOW_HOURS = 24;
export const PENDING_ENROLLMENT_TTL_MINUTES = 30;
export const WAITLIST_NOTIFICATION_TTL_MINUTES = 15;

export const PHASE_1_DAYS_BEFORE_START = 7;
export const PAYMENT_DEADLINE_DAYS_AFTER_START = 7;

/**
 * Current enrollment period — the window of possible student start dates.
 * Students who enroll run from their start date through the 4th Saturday after start.
 */
export const ENROLLMENT_PERIOD = {
  start: '2026-03-30',
  end: '2026-04-25',
} as const;

export const ROLES = {
  PARENT: 'parent',
  STUDENT: 'student',
  ADMIN: 'admin',
} as const;

/** Get Stripe price based on group size */
export function getPriceForEnrollment(groupSizeType: string): number {
  if (groupSizeType === 'large') return PRICES.large;
  if (groupSizeType === 'small') return PRICES.small;
  if (groupSizeType === 'one_on_one') return PRICES.one_on_one;
  return PRICES.small;
}

/** Format subject for display */
export function formatSubject(subject: string | null): string {
  switch (subject) {
    case 'digital_rw': return 'DSAT Reading & Writing';
    case 'digital_math': return 'DSAT Math';
    case 'digital_rw_math': return 'DSAT Reading, Writing & Math';
    case null: return '';
    default: return subject;
  }
}

/** Short subject label for compact display */
export function formatSubjectShort(subject: string | null): string {
  switch (subject) {
    case 'digital_rw': return 'Digital SAT R&W';
    case 'digital_math': return 'Digital SAT Math';
    case 'digital_rw_math': return 'Digital SAT R&W + Math';
    case null: return '';
    default: return subject;
  }
}

/** Format subject category (stored on enrollment) for display */
export function formatSubjectCategory(category: string | null, detail?: string | null): string {
  switch (category) {
    case 'dsat_rw': return 'DSAT Reading & Writing';
    case 'dsat_math': return 'DSAT Math';
    case 'dsat_rw_math': return 'DSAT Reading, Writing & Math';
    case 'general_math': return detail ? `School Math: ${detail}` : 'School Math';
    case null: return '';
    default: return category;
  }
}

/** Format a time string like "15:00:00", "15:00", or "3:30 PM" to readable "3:00 PM" */
export function formatTime(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // Already in 12h format like "3:30 PM"
  if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(trimmed)) return trimmed;
  // 24h format: "15:00:00" or "15:00"
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return trimmed;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

/** Day-of-week index for ordering (Monday-first) */
const DAY_ORDER: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6,
};
export function dayIndex(day: string): number {
  return DAY_ORDER[day] ?? 99;
}

/** Format schedule for display — handles LG 2-day schedule */
export function formatSchedule(cls: {
  meeting_day: string;
  meeting_time: string;
  meeting_day_2?: string | null;
  meeting_time_2?: string | null;
}): string {
  if (cls.meeting_day_2 && cls.meeting_time_2) {
    if (cls.meeting_time === cls.meeting_time_2) {
      return `${cls.meeting_day} & ${cls.meeting_day_2} at ${formatTime(cls.meeting_time)}`;
    }
    return `${cls.meeting_day} at ${formatTime(cls.meeting_time)} & ${cls.meeting_day_2} at ${formatTime(cls.meeting_time_2)}`;
  }
  return `${cls.meeting_day} at ${formatTime(cls.meeting_time)}`;
}
