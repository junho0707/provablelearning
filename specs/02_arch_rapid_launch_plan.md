# 🚀 RAPID LAUNCH PLAN v3.1 (PHONE RULE FIXED)

## Tech Stack
- Next.js (App Router)
- Supabase (Postgres + Auth + RLS)
- Stripe
- Google Workspace
- Twilio (optional, later phase)

---

# PHASE 0 — HARD CONSTRAINTS (NO AMBIGUITY)

## Core Business Rules

1. Parent can create multiple students.
2. Student accounts are NOT independently convertible in Phase 1.
3. Parent attachment to existing student requires verification.
4. No duplicate enrollments.
5. No mid-module enrollments.
6. No cohort switching mid-module.
7. Max 3 enrollments per student per subject (lifetime).
8. Modules do NOT overlap per subject.
9. Student may enroll in RW and Math simultaneously.
10. Refunds default to CREDIT (except 1:1 case).
11. Enrollment seat is NOT reserved until DB transaction succeeds.
12. Agreement must be signed before Stripe session creation.
13. Phone number REQUIRED for:
    - All parents
    - Independent students

All constraints enforced at DATABASE level whenever possible.

---

# PHASE 1 — DATABASE (STRICT + DEFENSIVE)

## users
- id (uuid, from Supabase auth)
- role (parent | student | admin)
- full_name
- phone (REQUIRED for parent OR independent student)
- created_at

Constraints:
- role immutable
- CHECK(role IN ('parent','student','admin'))

Enforcement Logic:
- IF role = parent → phone NOT NULL
- IF role = student AND no parent attached → phone NOT NULL
- IF role = student AND has parent → phone nullable

---

## students
- id (uuid)
- parent_id (uuid, nullable only if independent student)
- grade_level
- active_status (active | inactive)

Constraints:
- FOREIGN KEY parent_id → users(id)
- CHECK active_status
- parent_id required unless explicitly independent student
- If parent_id IS NULL → corresponding user.phone MUST NOT be NULL

---

## modules
- id
- subject (digital_rw | digital_math)
- level (essentials | advanced)
- name
- start_date
- end_date
- max_reenroll DEFAULT 3

Constraints:
- No overlapping date ranges per subject
- CHECK start_date < end_date

---

## cohorts
- id
- module_id
- group_size_type (1:1 | small | medium | large)
- capacity
- meeting_day
- meeting_time
- google_meet_link
- active (boolean)

IMPORTANT:
DO NOT store current_enrollment.

Enrollment count MUST be derived:

SELECT COUNT(*)
FROM enrollments
WHERE cohort_id = X
AND status = 'active';

WHY?
- Prevents stale counts
- Eliminates race-condition desync
- Single source of truth = enrollments table

---

## enrollments
- id
- student_id
- cohort_id
- module_id
- stripe_session_id (nullable until created)
- status (pending | active | completed | refunded | canceled)
- agreement_version
- agreement_timestamp
- created_at

Constraints:
- UNIQUE(student_id, cohort_id)
- UNIQUE(stripe_session_id)
- UNIQUE(student_id, module_id)
- CHECK status enum

---

## waitlist
- id
- student_id
- cohort_id
- created_at
- notified_at
- status (waiting | notified | expired | converted)

---

## performance_logs
- id
- student_id
- module_id
- week_number
- session_number (1–8)
- attendance (bool)
- homework_completed (bool)
- notes

---

## credits
- id
- student_id
- amount
- remaining_amount
- reason
- expires_at
- created_at

Credits NEVER modify Stripe records directly.
Stripe handles payments.
Credits handle internal accounting.

Credit deduction uses `apply_credits` RPC — atomic FIFO with `FOR UPDATE` row locks.
Prevents double-spending under concurrent requests.

---

## admin_logs
- id
- admin_id
- action
- metadata_json
- created_at

All destructive admin actions logged.

---

# PHASE 2 — ENROLLMENT FLOW (RACE SAFE)

## Critical Principle
Seat locking happens BEFORE Stripe Checkout.

## Transaction Flow

BEGIN TRANSACTION

1. SELECT cohort FOR UPDATE
2. Count active enrollments
3. If capacity reached → abort
4. Insert enrollment (status = 'pending')

COMMIT

Then:
5. Check credit balance
6. If credits cover full price → apply credits (atomic RPC) → activate enrollment → done
7. Otherwise → create Stripe Checkout Session (with try/catch; on failure, rollback enrollment)
8. Apply partial credits only AFTER Stripe session is confirmed
9. Attach enrollment_id in metadata
10. Update stripe_session_id in enrollment

---

# PHASE 3 — STRIPE WEBHOOK LOGIC

If payment_success:
- Update enrollment → active

If payment_failed OR expired:
- DELETE enrollment WHERE status = pending

Daily reconciliation job:
- Compare Stripe successful payments vs DB active enrollments

Admin reconciliation dashboard available.

---

# PHASE 4 — WAITLIST SYSTEM

If capacity full:
- Student selects which child (parent) or self (student) via form
- Server action calls joinWaitlist() → inserts into waitlist table
- Redirects to /enroll with confirmation

When seat opens:
- Notify first waiting student (shared notifyNextOnWaitlist function)
- Set notified_at timestamp
- Claim window defined by WAITLIST_CLAIM_WINDOW_HOURS constant (24 hours)
- If unclaimed → mark expired
- Move to next

Priority:
- Makeup students override standard waitlist.

---

# PHASE 5 — CREDIT & REFUND RULES

## Credit Deadline Policy (per group size)

| Group Type | If Not Made Up By End of Week (Sunday 11:59 PM ET) |
|------------|-----------------------------------------------------|
| **1:1** | Non-expiring credit auto-issued |
| **Small** | Credit auto-issued |
| **Medium** | Credit auto-issued |
| **Large** | No credit (alternate session only) |

## Refund Policy
- Refunds are case-by-case — parent schedules consultation via `/book`
- Admin processes refund after meeting (Stripe refund or credit)

Refund processing order:
1. If Stripe refund → attempt Stripe API call FIRST
2. Only on success → update enrollment status to 'refunded'
3. If Stripe fails → return error to admin, enrollment status unchanged (admin can retry)

Credit application at enrollment time:
- Check credit balance
- If credits >= full price → apply credits, activate enrollment directly (no Stripe)
- If partial credits → create Stripe session first, then apply credits only after session confirmed
- If Stripe session creation fails → rollback pending enrollment, credits untouched

---

# PHASE 6 — DASHBOARD STRUCTURE

## Parent Dashboard

Each student card shows:
- Active modules
- Cohort info
- Credit balance
- Performance summary
- Enrollment history

Parent can add children directly from dashboard:
- "Add Child" button → form (name + grade level)
- Creates users row (role=student) + students row (parent_id=current user)
- Child has no auth account — parent manages everything
- Child can later be linked to a Google account by admin if independent access needed

---

## Student Dashboard

Per module:
- Schedule
- Google Meet link
- Attendance log
- Homework status
- Makeup request button

Multiple concurrent modules supported.

---

# PHASE 7 — GOOGLE WORKSPACE SAFETY

- Meet links stored in DB
- Drive folder naming:
  subject_level_startDate
- Weekly backup export:
  - enrollments
  - performance_logs
  - credits

Backup stored separately from live Drive.

---

# PHASE 8 — MAKEUP LOGIC

Session cancellation:
- Parent/student cancels session via `/parent/cancel-session` or `/student/cancel-session`
- 24-hour notice required for small groups
- System records cancellation in `session_cancellations` table

Makeup path:
- **1:1:** Reschedule via Google Calendar (tutor availability)
- **Small/Medium/Large:** Book alternate session same week (different class, same course/group size)
- Alternate session booking validates same-week + capacity (active enrollments + booked makeups)

Credit auto-issuance:
- Cron job (`/api/cron/cancel-credits`) checks `credit_deadline` (Sunday end-of-week)
- Small/Medium/1:1 past deadline with status `cancelled` → auto-issue credit
- Large → no credit (expires after 7 days)
- Makeup no-shows → revert cancellation to `cancelled` so credit deadline fires

Makeup attendance tracked in `makeup_bookings` table (booked → attended/no_show).

---

# PHASE 9 — ADMIN GUARDRAILS

Admin CANNOT:
- Delete module with active enrollments
- Reduce capacity below active enrollment count
- Modify past performance logs without audit entry

All changes logged in admin_logs.

---

# PHASE 10 — DATA INTEGRITY ENFORCEMENT

Enforced via:
- Unique constraints
- Foreign keys
- CHECK constraints
- Transactional seat locking

Additional checks:
- Time conflict validation before enrollment
- Reenroll count validated before insert

---

# PHASE 11 — LEGAL & AGREEMENTS

At checkout:
- Academic agreement checkbox
- Refund policy checkbox

Stored in enrollments:
- agreement_version
- agreement_timestamp

Immutable after activation.

---

# PHASE 12 — SCALABILITY (SAFE TO 50–100 STUDENTS)

Safe because:
- Supabase handles auth + RLS
- Stripe handles billing
- No derived enrollment counters
- Transactions prevent race conditions

Likely bottleneck:
- Manual reporting

Solution:
- Auto-generate monthly performance summary
- Exportable CSV per module

---

# SYSTEM GUARANTEES

✔ No overbooking  
✔ No duplicate enrollments  
✔ No mid-module switching  
✔ Strict reenroll limits  
✔ Stripe failure resilience  
✔ Credit accounting clarity  
✔ Admin action audit trail  
✔ Agreement tracking  
✔ Waitlist prioritization  
✔ Cohort capacity integrity  
✔ Required phone capture for independent students  

---

# END STATE

Production-safe MVP architecture with corrected phone enforcement rules.
