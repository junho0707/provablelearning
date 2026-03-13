# SG REWORK VERIFICATION FLOWS

**Date**: 2026-03-10
**Context**: SG/1:1 classes changed from subject-specific to subject-agnostic time slots. Subject moved to enrollment. SG capacity changed to 1-3. Pricing changed to $300/mo. All RPCs rewritten. Google Classroom for SG switched to per-student.

**Known Issues Found During Code Review** (fix before or during verification):
1. **SG waitlist form does NOT collect subject_category** — waitlist-converted enrollments will have NULL subject
2. **Waitlist offer acceptance does NOT pass subject to reserveSeat()** — same NULL subject problem
3. **Parent/student dashboards may not display enrollment subject** — need to verify JSX renders it

---

## Flow 1: Admin — Create SG Class (Subject-Agnostic)

### Step 1: Create SG Slots

Navigate to /admin/classes/new, select Small Group, fill in:

- Name: SG Tue/Thu Morning
- Subject: **should NOT be shown** (SG is subject-agnostic now)
- Level: **should NOT be shown**
- Capacity: 3 (max is now 3, was 4)
- Slots: Tue 10:00, Thu 10:00 (via batch slot builder)

Submit.

Verify:
- [ ] Form does NOT show subject or level fields for SG
- [ ] Form shows message like "Subject and level are set per student at enrollment time"
- [ ] 2 separate class rows appear under Small Group section
- [ ] Each shows 0 / 3
- [ ] DB: both rows have `subject IS NULL` and `level IS NULL`
- [ ] DB: `group_size_type = 'small'`, `capacity = 3`
- [ ] Google Calendar events created for each slot

### Step 2: Negative — SG Capacity Out of Range

- Try capacity = 0 → error
- Try capacity = 4 → error (max is now 3)
- Try capacity = 1 → should succeed (min is now 1)

Verify:
- [ ] DB constraint `chk_capacity_small` enforces 1-3 range

### Step 3: Negative — SG with Subject/Level

If somehow subject or level could be set (e.g., API call), verify:

- [ ] DB constraint `chk_sg_1on1_no_subject` rejects SG rows with non-NULL subject/level

---

## Flow 2: Admin — Create 1:1 Class (Subject-Agnostic)

### Step 1: Create 1:1 Slots

Navigate to /admin/classes/new, select 1:1 Private, fill in:

- Name: 1:1 Mon/Wed Afternoon
- Subject: **should NOT be shown**
- Level: **should NOT be shown**
- Capacity: 1 (locked)
- Slots: Mon 16:00, Wed 16:00

Submit.

Verify:
- [ ] Form does NOT show subject or level fields for 1:1
- [ ] 2 class rows appear, each 0 / 1
- [ ] DB: `subject IS NULL`, `level IS NULL`, `group_size_type = 'one_on_one'`

---

## Flow 3: Admin — Create LG Class (Unchanged)

### Step 1: Create LG Class

- Name: SAT R&W Essentials LG
- Subject: DSAT Reading & Writing → **still required for LG**
- Level: Essentials → **still required for LG**
- Capacity: 15

Submit.

Verify:
- [ ] Subject and level fields ARE shown for LG
- [ ] DB: `subject IS NOT NULL`, `level IS NOT NULL`
- [ ] DB constraint `chk_lg_requires_subject` enforces this

---

## Flow 4: Admin — Edit SG/1:1 Class

Navigate to /admin/classes → View an SG class → edit page.

Verify:
- [ ] Subject/level fields are NOT editable (show read-only message)
- [ ] Can edit: name, capacity (within 1-3 for SG), active status, meeting day/time
- [ ] Save → changes persist

---

## Flow 5: Enrollment — SG with Subject Picker

### Step 1: Browse Classes

1. Login as parent → /enroll
2. View available SG slots

Verify:
- [ ] SG class cards do NOT show a subject label (they're subject-agnostic slots)
- [ ] Cards show: name, day/time, available seats, group size type

### Step 2: Enroll with Subject Selection

1. Click an SG slot → enrollment page
2. Select student
3. Pick 2 SG slots (slot 1 + slot 2)

Verify:
- [ ] **Subject category picker appears** (only for SG/1:1, not LG)
- [ ] Options: DSAT Reading & Writing, DSAT Math, DSAT Reading Writing & Math, General Math
- [ ] Selecting "General Math" shows a free-text detail field
- [ ] Subject is required — cannot submit without choosing one

4. Select subject (e.g., DSAT Math), pick start date
5. Click "Pay Now" → Stripe Checkout → complete payment

Verify:
- [ ] Enrollment created with correct `subject_category = 'dsat_math'`
- [ ] `subject_detail` is NULL (not general_math)
- [ ] `slots_per_week = 2`
- [ ] `slot_1_class_id` and `slot_2_class_id` set correctly
- [ ] `slot_3_class_id IS NULL`
- [ ] Status = active, payment_status = paid
- [ ] Google Classroom created **per-student** (not shared)
- [ ] Pricing: $300 (30000 cents in Stripe)

### Step 3: Enroll with General Math + Detail

1. Enroll another student in SG
2. Select "General Math" as subject
3. Enter detail: "Algebra 2"

Verify:
- [ ] `subject_category = 'general_math'`
- [ ] `subject_detail = 'Algebra 2'`

---

## Flow 6: Enrollment — 1:1 with Subject Picker

1. Browse 1:1 slots → pick 2 slots
2. Subject picker should appear
3. Select a subject, complete enrollment

Verify:
- [ ] Same subject picker as SG
- [ ] Enrollment row has `subject_category` set
- [ ] `slots_per_week = 2`
- [ ] Dual-slot enrollment works
- [ ] Google Classroom created per-student
- [ ] Pricing: $800 (80000 cents)

---

## Flow 7: Enrollment — LG (No Subject Picker)

1. Enroll in an LG class

Verify:
- [ ] **No subject picker shown** (LG gets subject from the class itself)
- [ ] Enrollment row: `subject_category IS NULL` (subject lives on class, not enrollment)
- [ ] `slots_per_week IS NULL`
- [ ] Single-slot enrollment (no slot_2)

---

## Flow 8: Enrollment — Capacity Enforcement with 3-Slot Check

### Step 1: Fill SG Class to Capacity

1. Create SG slot with capacity = 2
2. Enroll Student A using this as slot_1
3. Enroll Student B using this as slot_2

Verify:
- [ ] Both enrollments counted against capacity
- [ ] Capacity query checks `slot_1_class_id`, `slot_2_class_id`, AND `slot_3_class_id`

### Step 2: Try Enrolling a 3rd Student

1. Try enrolling Student C using this slot

Verify:
- [ ] Error: "class is full"
- [ ] No enrollment created

---

## Flow 9: Parent/Student Dashboard — Subject Display

### Step 1: Parent Dashboard

1. Login as parent with SG-enrolled child → /parent

Verify:
- [ ] Enrollment card shows the student's **subject** (from enrollment, not class)
- [ ] Uses `formatSubjectCategory()` — e.g., "DSAT Math" or "General Math: Algebra 2"
- [ ] Session schedule displays correctly (odd sessions → slot_1, even → slot_2)
- [ ] No crashes or blank fields from NULL class.subject

### Step 2: Student Dashboard

1. Login as independent SG student → /student

Verify:
- [ ] Same subject display as parent dashboard
- [ ] All enrollment info renders correctly

---

## Flow 10: Cancel Session — SG

### Step 1: Cancel an Upcoming SG Session

1. Login as parent → /parent/cancel-session
2. Select SG-enrolled student, pick an upcoming session
3. Enter reason, submit

Verify:
- [ ] Session number range is 1-8 (for 2-slot enrollment)
- [ ] `session_cancellations` row created with correct `session_date`, `session_number`, `class_id`
- [ ] `class_id` = the specific slot's class (not the other slot)
- [ ] Status = `cancelled`
- [ ] Credit deadline = end of week (Sunday 11:59:59 PM ET)
- [ ] 24-hour notice enforced: can't cancel a session less than 24h away

### Step 2: Cancel LG Session (Blocked)

1. Try cancelling an LG session

Verify:
- [ ] Error: "Large group sessions cannot be cancelled. Watch the recording on Google Classroom."

---

## Flow 11: Find Alternate Sessions — Subject-Agnostic

### Step 1: View Alternates After Cancellation

1. After cancelling an SG session, click "Find Alternate Session"

Verify:
- [ ] Alternates listed match by **group_size_type ONLY** (not subject/level)
- [ ] Any SG class with open capacity in the same week appears (regardless of what subject other students chose)
- [ ] Student's own enrolled slots are excluded
- [ ] Past sessions excluded
- [ ] Capacity check includes slot_1, slot_2, AND slot_3 enrollments

---

## Flow 12: Book Makeup — SG

### Step 1: Book an Alternate

1. From the alternates list, pick one and book it

Verify:
- [ ] `makeup_bookings` row created: `host_class_id`, `session_number`, `session_date`, status = `booked`
- [ ] Cancellation status → `rescheduled`
- [ ] Cannot book into a class the student is already enrolled in (checks all 3 slot columns)
- [ ] Same-week constraint enforced
- [ ] Capacity check includes slot_3 enrollments + existing makeup bookings

### Step 2: Cancel a Makeup

1. Cancel the booked makeup

Verify:
- [ ] Makeup booking status → `cancelled`
- [ ] Original cancellation status reverts to `cancelled`

---

## Flow 13: Credit Issuance + Redemption

### Step 1: Credit Issued (No Alternate Available)

1. Cancel an SG session when no alternates exist (or let credit deadline pass)

Verify:
- [ ] Credit row created with correct `student_id`, `group_size_type`, `amount`
- [ ] Credit linked to cancellation via `source_cancellation_id`

### Step 2: Redeem Credit

1. Go to /parent/redeem-credit (or /student/redeem-credit)
2. Browse available sessions — should show eligible makeup sessions

Verify:
- [ ] Available sessions match by **group_size_type only** (not subject/level)
- [ ] Book a makeup using credit
- [ ] Credit consumed (FIFO order via `apply_credits` RPC)
- [ ] `makeup_bookings` row created
- [ ] Dashboard updated

---

## Flow 14: Enrollment Makeup Conflict Resolution (Migration 00084)

### Step 1: Trigger Conflict

1. Have an SG class at capacity with an existing makeup booking for a session
2. Drop one enrolled student → enroll a new student in that slot

Verify:
- [ ] `resolve_enrollment_makeup_conflicts` RPC fires
- [ ] Conflicting session auto-cancelled for the new student
- [ ] Credit issued immediately (30-day expiry)
- [ ] Admin log written with `enrollment_makeup_conflict_resolved`
- [ ] Student can use the credit to book an alternate

---

## Flow 15: Drop Class — SG

### Phase 1: Self-Drop (>14d before start)

1. Enroll student in SG starting >14 days from now (unpaid)
2. Drop class

Verify:
- [ ] Enrollment status → `dropped` or `cancelled`
- [ ] Seat freed — capacity recalculated (checks slot_1, slot_2, slot_3)
- [ ] Subject on enrollment doesn't interfere with drop logic

### Phase 2 & 3: Same as before, verify no regressions.

---

## Flow 16: Waitlist — LG (Auto-Enroll, Unchanged)

1. Fill LG class → student joins waitlist
2. Drop someone → cron fires → auto-enroll

Verify:
- [ ] Auto-enroll works as before
- [ ] `auto_enroll_from_waitlist` RPC capacity check includes slot_3 column
- [ ] LG enrollment doesn't need subject_category (comes from class)

---

## Flow 17: Waitlist — SG (Notify + Accept)

### Step 1: Join SG Waitlist

1. All SG slots full → student joins SG waitlist with preferred slots

Verify:
- [ ] Waitlist row created with `preferred_class_ids`
- [ ] **BUG CHECK**: Does the form collect `subject_category`? (Code review says NO — this is a gap)

### Step 2: Seat Opens → Notification

1. Seat opens in one of the preferred slots
2. Cron runs → `notifySgWaitlistNext()` called

Verify:
- [ ] Student notified, `status = 'notified'`, `offer_expires_at` set (3 days)
- [ ] At least 2 preferred slots must have capacity

### Step 3: Accept Offer

1. Student visits /enroll/waitlist-offer/[waitlistId]
2. Picks 2 slots, submits

Verify:
- [ ] **BUG CHECK**: Does `acceptOfferAction()` pass `subject_category` to `reserveSeat()`? (Code review says NO)
- [ ] If not fixed: enrollment created with `subject_category = NULL` — broken
- [ ] If fixed: subject picker shown on offer page, subject stored on enrollment

### Step 4: Offer Expiry

1. Let 3 days pass without acceptance

Verify:
- [ ] Entry status → `expired`
- [ ] Next waiting student notified
- [ ] Expired offer page shows appropriate message

---

## Flow 18: Stripe Pricing

1. Complete SG enrollment via Stripe

Verify:
- [ ] SG price = $300/mo (30000 cents)
- [ ] 1:1 price = $800/mo (80000 cents)
- [ ] LG price = $20/mo (2000 cents) — unchanged

---

## Flow 19: Performance Logging — SG

1. Admin → /admin/performance
2. Select an SG class, pick a session number
3. Log performance for students

Verify:
- [ ] Enrolled students found correctly (query checks slot_1, slot_2, slot_3)
- [ ] Makeup students also listed
- [ ] Unique constraint `(student_id, class_id, session_number)` still works
- [ ] No crashes from NULL subject/level on class

---

## Flow 20: Admin Views — No NULL Crashes

### Admin Classes List (/admin/classes)
- [ ] SG/1:1 classes display without subject/level (no "undefined" or blank crash)

### Admin Students (/admin/students)
- [ ] Student enrollments show subject from enrollment (via `formatSubjectCategory`)

### Admin Makeups (/admin/makeups)
- [ ] Makeup bookings display correctly without subject/level on host class

### Admin Export (/admin/export)
- [ ] Export queries handle NULL subject/level gracefully

### Admin Calendar (/admin/calendar)
- [ ] Calendar renders SG/1:1 classes without crashing on NULL fields

### Admin Credits (/admin/credits)
- [ ] Credit list works correctly

### Admin Logs (/admin/logs)
- [ ] Log entries from new RPCs display correctly

---

## Flow 21: Cron Jobs — No Regressions

### auto-unenroll (/api/cron/auto-unenroll)
- [ ] Unpaid SG enrollments past deadline are cancelled
- [ ] Capacity freed correctly (slot_3 checked)

### waitlist-notify (/api/cron/waitlist-notify)
- [ ] Expired offers cycled, next student notified
- [ ] SG/1:1 path calls `notifySgWaitlistNext()`
- [ ] LG path calls `autoEnrollFromWaitlist()`

### cancel-credits (/api/cron/cancel-credits)
- [ ] Credits issued for unresolved cancellations past deadline

### reports (/api/cron/reports)
- [ ] No broken queries from nullable subject/level

### booking-reminders (/api/cron/booking-reminders)
- [ ] Reminders sent correctly, no NULL field crashes

---

## BUGS FOUND AND FIXED

| # | Severity | Description | Fix |
|---|----------|-------------|-----|
| 1 | **HIGH** | Waitlist offer acceptance did not pass subject to reserveSeat() | Added subject picker to accept-form.tsx, pass through actions.ts to reserveSeat() |
| 2 | **HIGH** | Redeem credit completely broken for SG/1:1 — required subject/level which are NULL | Made subject/level optional in both redeem pages + findMakeupSessionsForCredit |
| 3 | **MEDIUM** | Parent/student dashboards did not display enrollment subject for SG/1:1 | Added formatSubjectCategory() display using enrollment.subject_category |
| 4 | **MEDIUM** | Waitlist offer page showed stale class subject (NULL for SG/1:1) | Removed stale formatSubject/formatLevel, show group type label instead |
| 5 | **LOW** | Parent dashboard slot3Class used out-of-scope slot2ClassMap | Attached _slot3Class in data prep like _slot2Class |

**Note**: SG waitlist form does NOT collect subject — this is by design. Subject is chosen when accepting the offer (student may change their mind by the time a spot opens).
