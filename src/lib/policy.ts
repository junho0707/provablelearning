/**
 * Single source of truth for the policy numbers in `system/02-POLICIES.md`. Everything that
 * enforces or *states* a rule reads it from here, so the SQL, the UI copy, and the docs cannot
 * drift apart silently. `policy.test.ts` asserts these against the values written in the docs.
 *
 * Prices live in `pricing.ts`; this module is the non-monetary half of the same idea.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** One session, universally (`02-POLICIES.md` §1). */
export const SESSION_MINUTES = 60;

/**
 * Minimum notice to book (`02-POLICIES.md` §2). Six hours, matching the free-cancellation window
 * so one number governs both ends of the same decision.
 */
export const MIN_NOTICE_MS = 6 * HOUR_MS;

/**
 * A slot freed by a cancellation may be reclaimed later than the normal floor — it is already on
 * the operator's calendar, so refusing to let someone take it only wastes it (INV-BOOK-3).
 */
export const RELEASED_SLOT_MIN_NOTICE_MS = 1 * HOUR_MS;

/** How far ahead the calendar shows (`02-POLICIES.md` §2). */
export const BOOKING_HORIZON_MS = 4 * 7 * DAY_MS;

/**
 * The horizon steps on a weekday boundary rather than creeping forward daily: every Monday the
 * fifth week out unlocks. `1` is Monday in `Date.getUTCDay()`/`localDateParts` terms.
 */
export const RELEASE_WEEKDAY = 1;

/** Free cancellation and reschedule window (`02-POLICIES.md` §3). Deliberately equal to the booking floor. */
export const FREE_CANCEL_MS = MIN_NOTICE_MS;

/** How late counts as a no-show (`02-POLICIES.md` §4). The operator marks it by hand. */
export const NO_SHOW_AFTER_MINUTES = 15;

/**
 * Credit returns per student per calendar month, combined across late cancellations and no-shows
 * (`02-POLICIES.md` §5, INV-CREDIT-2). The third miss in a month is permanent and offers no appeal.
 */
export const CREDIT_RETURNS_PER_MONTH = 2;

/** Target for delivering post-session materials (`02-POLICIES.md` §9). */
export const MATERIALS_DUE_HOURS = 24;

/** Uploads accepted on a booking (`02-POLICIES.md` §10). */
export const UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const UPLOAD_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Student-submitted data is deleted this long after deletion, revocation, or closure. */
export const RETENTION_DAYS = 30;

/** Buyer-facing phrasings, so page copy never restates a number the code owns. */
export const POLICY_COPY = {
  minNotice: "6 hours",
  horizon: "4 weeks",
  release: "New times open every Monday.",
  freeCancel: "Free to cancel or reschedule 6 or more hours ahead — the credit comes back.",
  lateCancel:
    "Inside 6 hours the credit is used. Tell us what happened and we'll review it — up to 2 credit returns per student each month.",
  noShow:
    "15 minutes late counts as a missed session. Tell us what happened and we'll review it — it counts toward the same 2 per month.",
  creditsNeverExpire: "Credits never expire.",
  materials: "Your written materials arrive within 24 hours of the session.",
} as const;
