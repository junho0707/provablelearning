# Remaining QA Flows — Divided by DB Tweak Requirement

**Picking up after:** Flow 5 (verified)
**Two groups:** A = pure UI testing (no SQL needed), B = requires DB date/state manipulation

---

## GROUP A — No DB Tweaks (UI-Only Testing)

These can all be verified through normal UI flows with future-dated courses.

---

### Flow 7A: Duplicate Enrollment Block
- [ ] Try to enroll Alice in Class A **again** (she's already enrolled from Flow 3)
- [ ] **EXPECT:** error "Already enrolled in this class."

### Flow 7B: Time Conflict
- [ ] Create another course (overlapping dates) with a class on **same day/time** as Class A (Monday 4 PM)
- [ ] Try to enroll Alice
- [ ] **EXPECT:** error "Time conflict with an existing enrollment."

==> BOTH VERIFIED <==

### ~~Flow 7C: Re-enrollment Limit (max 3 per course)~~ → Moved to Group B
- Requires multiple refund/re-enroll cycles + SQL verification of per-course counting
- See Group B below

---

### Flow 8: Performance Logging

#### 8A. Log Session Data
- [ ] Admin → `/admin/performance`
- [ ] Select Class A, week 1, session 1
- [ ] **EXPECT:** Alice and Bob listed (enrolled students)
- [ ] Alice: present + HW done | Bob: absent + HW not done
- [ ] Save → **EXPECT:** success message

#### 8B. Dashboard Reflects Data
- [ ] Login as first parent → parent dashboard
- [ ] **EXPECT:** Alice: 1/1 attendance, 1/1 HW | Bob: 0/1 attendance, 0/1 HW
- [ ] Login as Alice (student username) → `/student`
- [ ] **EXPECT:** session grid shows attendance + homework status for session 1

#### 8C. Idempotent Re-submit
- [ ] Admin: log same session again with flipped data
- [ ] **EXPECT:** updates in place, no duplicate rows

==> ALL VERIFIED <==

---

### Flow 9A–9C: Session Cancellation + Makeup (UI parts)

#### 9A. Cancel Alice's Session
- [ ] Login as first parent → `/parent/cancel-session`
- [ ] Select Alice's upcoming session in Class A
- [ ] Enter reason, submit
- [ ] **EXPECT:** success + "Find Alternate Session" link in cancellation history (small group)
- [ ] **EXPECT:** message says "by end of this week (Sunday)"

#### 9B. Book Alternate Session
- [ ] Click "Find Alternate Session" → alternate page
- [ ] **EXPECT:** lists other small-group classes for same course, same week
- [ ] If Class B has capacity → book it
- [ ] **EXPECT:** cancellation status → `rescheduled`

#### 9C. Cancel Makeup Booking
- [ ] From cancellation history on parent dashboard, cancel the makeup booking
- [ ] **EXPECT:** status reverts to `cancelled`, alternate seat freed
- [ ] **EXPECT:** credit deadline still ticking

#### 9F. Makeup Waitlist (UI portion)
- [ ] Fill the alternate class to capacity
- [ ] Cancel Alice's session → "Find Alternate" → **EXPECT:** "Join Makeup Waitlist" button shown
- [ ] Join makeup waitlist
- [ ] **NOTE:** auto-book verification after dropping a student is in Group B (needs SQL verify)

==> VERIFIED <== 

---

### Flow 10: Student Access

#### 10A. Independent Student Signup (Google OAuth)
- [ ] `/signup` → select "Student" → "Sign up with Google"
- [ ] Complete Google OAuth
- [ ] **EXPECT:** redirected to `/onboarding?role=student`, role field **locked**
- [ ] Enter name, phone (optional), submit → **EXPECT:** redirected to `/student`

#### 10B. Parent-Added Student Login (Username)
- [ ] `/login` → "Student Username" tab → Alice's username + password
- [ ] **EXPECT:** redirected to `/student`

#### 10C. Student Dashboard (View-Only)
- [ ] **EXPECT:** profile, notifications (with "Mark Read"), active enrollments with:
  - Course name, subject, level, dates, meeting day/time

#### 10B. Parent-Added Student Login (Username)
- [ ] `/login` → "Student Username" tab → Alice's username + password
- [ ] **EXPECT:** redirected to `/student`

#### 10C. Student Dashboard (View-Only)
- [ ] **EXPECT:** profile, notifications (with "Mark Read"), active enrollments with:
  - Course name, subject, level, dates, meeting day/time
  - Google Classroom link (if configured), Google Meet link (if configured)
  - 8-session attendance/homework grid
- [ ] **EXPECT:** office hours section, message form

#### 10D. Student Sends Message
- [ ] Type message in message form, submit
- [ ] Login as admin → `/admin/messages` → **EXPECT:** message visible

#### 10E. Student Cannot Enroll or Cancel
- [ ] As student → `/enroll` → **EXPECT:** redirected to `/student`
- [ ] As student → `/parent/cancel-session` → **EXPECT:** redirected away

---

### Flow 11: Audit Trail & Export

#### 11A. Audit Logs
- [ ] Admin → `/admin/logs`
- [ ] **EXPECT:** entries for: credit issuance, refunds, performance logs, enrollment activations, drops

#### 11B. CSV Export
- [ ] Admin → `/admin/export`
- [ ] Export each: enrollments, performance, credits, students
- [ ] **EXPECT:** CSV downloads with correct row counts

---

### Flow 12: Security Checks

#### 12A. Cross-Role Route Block
- [ ] As parent → navigate to `/admin` → **EXPECT:** redirected to `/parent`

#### 12B. Admin Can't Enroll
- [ ] As admin → navigate to `/enroll` → **EXPECT:** redirected to `/admin`

#### 12C. Ownership Violation
- [ ] In DevTools, modify student `<select>` value to a UUID not belonging to you
- [ ] Submit enrollment → **EXPECT:** error about unauthorized access

#### 12D. Unauthenticated Access
- [ ] Clear cookies → `/parent` → **EXPECT:** redirected to `/login?redirectTo=/parent`

#### 12E. Admin Self-Signup Block
- [ ] Attempt signup with role set to `admin`
- [ ] **EXPECT:** error "Admin accounts cannot be self-created"

---

### Flow 13: Parent Refund Booking Flow

#### 13A. Refund Page
- [ ] Login as parent → `/parent/refund`
- [ ] **EXPECT:** heading "Refunds", explanation text, "Schedule a Consultation" link to `/book`
- [ ] **EXPECT:** no form, no enrollment picker

#### 13B. Consultation Link
- [ ] Click "Schedule a Consultation" → **EXPECT:** `/book` page, generic heading

---

### Flow 14A: Phase 1 Drop (>7 days before start)
- [ ] Admin: create course with `start_date` 14+ days from now + class
- [ ] Enroll Alice
- [ ] Parent → `/parent/drop-class?student=<alice_student_id>`
- [ ] **EXPECT:** "Drop This Class" button (Phase 1)
- [ ] Click → confirm → submit → **EXPECT:** redirected to `/parent?dropped=1`
- [ ] **EXPECT:** `class_blocked = false`
- [ ] Re-enroll Alice in same class → **EXPECT:** success

### Flow 14B: Phase 2 Drop (≤7 days before start → 7 days after first session)
- [ ] Admin: create course with `start_date` = 3 days from now + class
- [ ] Enroll Alice
- [ ] Parent → `/parent/drop-class?student=<alice_student_id>`
- [ ] **EXPECT:** warning "You will not be able to re-enroll in this section" + textarea
- [ ] Enter note, submit → **EXPECT:** redirected to `/parent?dropped=1`
- [ ] **EXPECT:** `class_blocked = true`
- [ ] Re-enroll Alice in **same class** → **EXPECT:** blocked
- [ ] Enroll Alice in **different class** for same course → **EXPECT:** success

### Flow 7D: Class-Blocked Re-enrollment (verify after 14B)
- [ ] After Phase 2 drop above, try re-enroll same student in **same class**
- [ ] **EXPECT:** error "Re-enrollment into this class is not available. You may enroll in a different section."
- [ ] Enroll in a **different class** for same course → **EXPECT:** success

---

### Flow 15: Parent Child Management

#### 15A. Setup Login for Existing Child
- [ ] If a child has placeholder creds → parent dashboard → "Set Up Login"
- [ ] Enter username + password
- [ ] **EXPECT:** child card shows username + "Reset Password" instead of "Set Up Login"

#### 15B. Reset Child Password
- [ ] Parent dashboard → "Reset Password" on a child's card
- [ ] Enter new password + confirm → **EXPECT:** success
- [ ] Log out → student login with new password → **EXPECT:** success

---

## GROUP B — DB Tweaks Required (Post-Class-Start / Date Simulation)

These require SQL manipulation to simulate time passing, past dates, or verify auto-processes.

---

### Flow 7C: Re-enrollment Limit (max 3 per course)
- [ ] Enroll Alice in a course → admin refund → re-enroll → refund → re-enroll → refund → attempt 4th enrollment
- [ ] **EXPECT:** error about re-enrollment limit for this **course** (not subject)
- [ ] **VERIFY:** enrolling in a *different course* for the same subject (e.g. RW Advanced vs RW Essentials) is NOT blocked
- [ ] **NOTE:** migration 00043 changed limit from per-subject to per-course — this verifies the fix

---

### Flow 6: Credits System

#### 6A. Cancel Session → Simulate Deadline → Auto-Credit
- [ ] Login as first parent → `/parent/cancel-session`
- [ ] Cancel Alice's upcoming session in Class A
- [ ] **EXPECT:** cancellation with `credit_deadline` = end-of-week Sunday
- [ ] **DB TWEAK:**
  ```sql
  UPDATE session_cancellations
  SET credit_deadline = NOW() - INTERVAL '1 hour'
  WHERE id = (SELECT id FROM session_cancellations ORDER BY created_at DESC LIMIT 1);
  ```
- [ ] Run: `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/cancel-credits`
- [ ] **EXPECT:** credit auto-issued for Alice, type `small`
- [ ] Admin → `/admin/credits` → credit visible

#### 6B. Enroll with Credit
- [ ] Admin: create course "SAT Reading" (future dates) + Class C (small, capacity 3)
- [ ] Enroll Alice → **EXPECT:** `/enroll/success?paid_with_credits=true`
- [ ] **EXPECT:** credit balance decreased

#### 6C. No Double-Spend
- [ ] Create another small class (Class D), enroll Alice
- [ ] **EXPECT:** no credits left → activates with `test_mode=true`

---

### Flow 9D–9F: Session Cancellation (DB-dependent parts)

#### 9D. Auto-Credit via Cron
- [ ] **DB TWEAK:**
  ```sql
  UPDATE session_cancellations
  SET credit_deadline = NOW() - INTERVAL '1 hour'
  WHERE id = '<cancellation_id>';
  ```
- [ ] Run: `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/cancel-credits`
- [ ] **EXPECT:** credit auto-issued for `small` group type
- [ ] **VERIFY:** `SELECT * FROM credits WHERE student_id = '<id>' ORDER BY created_at DESC LIMIT 1`

#### 9E. Makeup No-Show Reverts Cancellation
- [ ] Book a makeup for Alice (9B), then:
  ```sql
  UPDATE makeup_bookings SET session_date = CURRENT_DATE - 1
  WHERE cancellation_id = '<cancellation_id>';
  ```
- [ ] Run: `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/cancel-credits`
- [ ] **EXPECT:** makeup_bookings status → `no_show`
- [ ] **EXPECT:** session_cancellations status → `cancelled` (reverted from `rescheduled`)
- [ ] **EXPECT:** credit deadline still ticking

#### 9F-verify. Makeup Waitlist Auto-Book (SQL verification)
- [ ] After joining makeup waitlist (Group A 9F), drop/refund one student from alternate class
- [ ] **EXPECT:** `auto_book_makeup_from_waitlist` fires → Alice auto-booked
- [ ] **VERIFY:** `SELECT status FROM makeup_waitlist WHERE student_id = '<id>'` → `converted`
- [ ] **EXPECT:** parent dashboard shows notification about auto-booked makeup

---

### Flow 14C: Phase 3 Drop (>7 days after first session)
- [ ] **DB TWEAK:** Admin create course, then backdate:
  ```sql
  UPDATE courses SET start_date = CURRENT_DATE - INTERVAL '21 days',
                     end_date = CURRENT_DATE + INTERVAL '7 days'
  WHERE id = '<course_id>';
  ```
- [ ] Enroll Alice (may need to also backdate class or override eligibility)
- [ ] Parent → `/parent/drop-class?student=<alice_student_id>`
- [ ] **EXPECT:** amber box with "schedule a refund consultation" link
- [ ] **EXPECT:** link = `/book?student=Alice&class=<course_name>&enrollment=<id>`
- [ ] Click → **EXPECT:** `/book` with "Request Refund Consultation" heading + blue context banner
- [ ] Complete booking
- [ ] **VERIFY:** `SELECT student_name, class_name FROM bookings ORDER BY created_at DESC LIMIT 1` → populated

---

### Flow 14D: RPC Server-Side Enforcement
- [ ] **DB TWEAK needed** to test each phase boundary:
  - Attempt Phase 1 drop via RPC when `daysUntilStart <= 7` → **EXPECT:** error
  - Attempt Phase 2 drop via RPC when `daysSinceFirstSession > 7` → **EXPECT:** error "Phase 2 drop window has passed"
  - Attempt Phase 3 drop as non-admin → **EXPECT:** error "Cannot self-drop in Phase 3"
  - Admin can drop in any phase → **EXPECT:** success regardless of timing
- [ ] Test by calling `drop_enrollment` RPC directly via Supabase SQL Editor with manipulated dates

---

