export const PRICES = {
  one_on_one: 80000, // $800.00 in cents
  small: 10000,      // $100.00
  medium: 5000,      // $50.00
  large: 2000,       // $20.00
} as const;

export const GROUP_SIZE_RANGES = {
  one_on_one: { min: 1, max: 1 },
  small: { min: 2, max: 4 },
  medium: { min: 5, max: 9 },
  large: { min: 10, max: 30 },
} as const;

export const MAX_REENROLL_PER_SUBJECT = 3;
export const SESSIONS_PER_COURSE = 8;
export const COURSE_DURATION_WEEKS = 4;

export const WAITLIST_CLAIM_WINDOW_HOURS = 24;
export const PENDING_ENROLLMENT_TTL_MINUTES = 30;
export const WAITLIST_NOTIFICATION_TTL_MINUTES = 15;

export const ROLES = {
  PARENT: 'parent',
  STUDENT: 'student',
  ADMIN: 'admin',
} as const;
