# Remaining QA Flows — Divided by DB Tweak Requirement

**Picking up after:** Flow 5 (verified)
**Two groups:** A = pure UI testing (no SQL needed), B = requires DB date/state manipulation

**Status: ALL FLOWS VERIFIED (2026-02-24)**

---

## GROUP A — No DB Tweaks (UI-Only Testing)

==> ALL GROUP A VERIFIED <==

---

### Flow 7A: Duplicate Enrollment Block
- [x] Try to enroll Alice in Class A **again** (she's already enrolled from Flow 3)
- [x] **EXPECT:** error "Already enrolled in this class."

### Flow 7B: Time Conflict
- [x] Create another course (overlapping dates) with a class on **same day/time** as Class A (Monday 4 PM)
- [x] Try to enroll Alice
- [x] **EXPECT:** error "Time conflict with an existing enrollment."

---

### Flow 8: Performance Logging

#### 8A. Log Session Data
- [x] Admin → `/admin/performance`
- [x] Select Class A, week 1, session 1
- [x] **EXPECT:** Alice and Bob listed (enrolled students)
- [x] Alice: present + HW done | Bob: absent + HW not done
- [x] Save → **EXPECT:** success message

#### 8B. Dashboard Reflects Data
- [x] Login as first parent → parent dashboard
- [x] **EXPECT:** Alice: 1/1 attendance, 1/1 HW | Bob: 0/1 attendance, 0/1 HW
- [x] Login as Alice (student username) → `/student`
- [x] **EXPECT:** session grid shows attendance + homework status for session 1

#### 8C. Idempotent Re-submit
- [x] Admin: log same session again with flipped data
- [x] **EXPECT:** updates in place, no duplicate rows

---

### Flow 9A–9C: Session Cancellation + Makeup (UI parts)

#### 9A. Cancel Alice's Session
- [x] Login as first parent → `/parent/cancel-session`
- [x] Select Alice's upcoming session in Class A
- [x] Enter reason, submit
- [x] **EXPECT:** success + "Find Alternate Session" link in cancellation history (small group)
- [x] **EXPECT:** message says "by end of this week (Sunday)"

#### 9B. Book Alternate Session
- [x] Click "Find Alternate Session" → alternate page
- [x] **EXPECT:** lists other small-group classes for same course, same week
- [x] If Class B has capacity → book it
- [x] **EXPECT:** cancellation status → `rescheduled`

#### 9C. Cancel Makeup Booking
- [x] From cancellation history on parent dashboard, cancel the makeup booking
- [x] **EXPECT:** status reverts to `cancelled`, alternate seat freed
- [x] **EXPECT:** credit deadline still ticking

#### 9F. Makeup Waitlist (UI portion)
- [x] Fill the alternate class to capacity
- [x] Cancel Alice's session → "Find Alternate" → **EXPECT:** "Join Makeup Waitlist" button shown
- [x] Join makeup waitlist

---

### Flow 10: Student Access

#### 10A. Independent Student Signup (Google OAuth)
- [x] `/signup` → select "Student" → "Sign up with Google"
- [x] Complete Google OAuth
- [x] **EXPECT:** redirected to `/onboarding?role=student`, role field **locked**
- [x] Enter name, phone (optional), submit → **EXPECT:** redirected to `/student`

#### 10B. Parent-Added Student Login
- [x] `/login` → student email + password
- [x] **EXPECT:** redirected to `/student`

#### 10C. Student Dashboard
- [x] **EXPECT:** profile, notifications (with "Mark Read"), active enrollments with:
  - Course name, subject, level, session dates, meeting day/time
  - Google Classroom link (if configured), Google Meet link (if configured)
  - 8-session attendance/homework grid
- [x] **EXPECT:** office hours section, message form

#### 10D. Student Sends Message
- [x] Type message in message form, submit
- [x] Login as admin → `/admin/messages` → **EXPECT:** message visible

#### 10E. Student Cannot Enroll or Cancel (parent-managed)
- [x] As parent-managed student → `/enroll` → **EXPECT:** redirected to `/student`
- [x] As parent-managed student → `/parent/cancel-session` → **EXPECT:** redirected away

---

### Flow 11: Audit Trail & Export

#### 11A. Audit Logs
- [x] Admin → `/admin/logs`
- [x] **EXPECT:** entries for: credit issuance, refunds, performance logs, enrollment activations, drops

#### 11B. CSV Export
- [x] Admin → `/admin/export`
- [x] Export each: enrollments, performance, credits, students
- [x] **EXPECT:** CSV downloads with correct row counts

---

### Flow 12: Security Checks

#### 12A. Cross-Role Route Block
- [x] As parent → navigate to `/admin` → **EXPECT:** redirected to `/parent`

#### 12B. Admin Can't Enroll
- [x] As admin → navigate to `/enroll` → **EXPECT:** redirected to `/admin`

#### 12C. Ownership Violation
- [x] In DevTools, modify student `<select>` value to a UUID not belonging to you
- [x] Submit enrollment → **EXPECT:** error about unauthorized access

#### 12D. Unauthenticated Access
- [x] Clear cookies → `/parent` → **EXPECT:** redirected to `/login?redirectTo=/parent`

#### 12E. Admin Self-Signup Block
- [x] Attempt signup with role set to `admin`
- [x] **EXPECT:** error "Admin accounts cannot be self-created"

---

### ~~Flow 13: Parent Refund Booking Flow~~ — REMOVED
Refund flow replaced by Phase 3 drop → `/book` consultation. Refund request buttons removed from parent + student dashboards. `/admin/refund-requests/` is dead code.

---

### Flow 14A: Phase 1 Drop (>7 days before start)
- [x] Admin: create course with `start_date` 14+ days from now + class
- [x] Enroll Alice
- [x] Parent → `/parent/drop-class?student=<alice_student_id>`
- [x] **EXPECT:** "Drop This Class" button (Phase 1)
- [x] Click → confirm → submit → **EXPECT:** redirected to `/parent?dropped=1`
- [x] **EXPECT:** `class_blocked = false`
- [x] Re-enroll Alice in same class → **EXPECT:** success

### Flow 14B: Phase 2 Drop (≤7 days before start → 7 days after first session)
- [x] Admin: create course with `start_date` = 3 days from now + class
- [x] Enroll Alice
- [x] Parent → `/parent/drop-class?student=<alice_student_id>`
- [x] **EXPECT:** warning "You will not be able to re-enroll in this section" + textarea
- [x] Enter note, submit → **EXPECT:** redirected to `/parent?dropped=1`
- [x] **EXPECT:** `class_blocked = true`
- [x] Re-enroll Alice in **same class** → **EXPECT:** blocked
- [x] Enroll Alice in **different class** for same course → **EXPECT:** success

### Flow 7D: Class-Blocked Re-enrollment (verify after 14B)
- [x] After Phase 2 drop above, try re-enroll same student in **same class**
- [x] **EXPECT:** error "Re-enrollment into this class is not available. You may enroll in a different section."
- [x] Enroll in a **different class** for same course → **EXPECT:** success

---

### Flow 15: Parent Child Management

#### 15A. Add Child
- [x] Parent dashboard → "Add Child" → enter name + grade + email + password
- [x] **EXPECT:** child appears on dashboard

#### 15B. Reset Child Password
- [x] Parent dashboard → "Reset Password" on a child's card
- [x] Enter new password + confirm → **EXPECT:** success
- [x] Log out → student login with new password → **EXPECT:** success

---

## GROUP B — DB Tweaks Required (Post-Class-Start / Date Simulation)

==> ALL GROUP B VERIFIED <==

---

### Flow 7C: Re-enrollment Limit (max 3 per course + group size)
- [x] **DB SETUP:** Disable trigger, insert 3 completed enrollments, re-enable
- [x] Try to enroll student in another **small-group** class for the **same course** → **EXPECT:** blocked
- [x] Try to enroll student in a **1:1** class for the **same course** → **EXPECT:** success (different group size)
- [x] Try to enroll student in a **small-group** class for a **different course** → **EXPECT:** success (different course)
- [x] **NOTE:** migration 00048 — limit is per (course + group_size_type), counts only active + completed

---

### Flow 6: Credits System

#### 6A. Cancel Session → Simulate Deadline → Auto-Credit
- [x] Cancel session → backdate `credit_deadline` → run cancel-credits cron
- [x] **EXPECT:** credit auto-issued for small group type
- [x] Admin → `/admin/credits` → credit visible

#### 6B. Enroll with Credit
- [x] Enroll with available credit → **EXPECT:** success with credits applied
- [x] **EXPECT:** credit balance decreased

#### 6C. No Double-Spend
- [x] No credits left → **EXPECT:** activates with `test_mode=true` (Stripe disabled)

---

### Flow 9D–9F: Session Cancellation (DB-dependent parts)

#### 9D. Auto-Credit via Cron
- [x] Backdate `credit_deadline` → run cron → **EXPECT:** credit auto-issued

#### 9E. Makeup No-Show Reverts Cancellation
- [x] Backdate makeup booking → run cron
- [x] **EXPECT:** makeup status → `no_show`, cancellation → `cancelled` (reverted from `rescheduled`)

#### 9F-verify. Makeup Waitlist Auto-Book
- [x] Drop student from alternate class → **EXPECT:** waitlisted student auto-booked
- [x] **VERIFY:** makeup_waitlist status → `converted`
- [x] **EXPECT:** parent dashboard shows notification

---

### Flow 14C: Phase 3 Drop (>7 days after first session)
- [x] Backdate course → drop class
- [x] **EXPECT:** amber box with "schedule a refund consultation" link to `/book`
- [x] **EXPECT:** `/book` with blue context banner showing student + class
- [x] Complete booking → **VERIFY:** bookings row has student_name + class_name

---

### Flow 14D: RPC Server-Side Enforcement
- [x] Phase 1 drop when `daysUntilStart <= 7` → **EXPECT:** error
- [x] Phase 2 drop when `daysSinceFirstSession > 7` → **EXPECT:** error
- [x] Phase 3 drop as non-admin → **EXPECT:** error "Cannot self-drop in Phase 3"
- [x] Admin can drop in any phase → **EXPECT:** success

---
