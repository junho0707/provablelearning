# Core Logic Test Flow — Manual QA Checklist

**Created:** 2026-02-22
**Updated:** 2026-02-23
**Purpose:** Step-by-step verification of every critical code path before launch.
**Prereq:** `STRIPE_ENABLED=false` in `.env.local`, migrations 00001–00041 applied, `npm run dev` running.

---

## Flow 1: Admin Setup & Course Creation

### 1A. Seed Admin
- [ ] Run seed steps from `specs/04_setup_admin_seed.md` in Supabase SQL Editor
- [ ] Create auth user `admin@provablelearning.com` (auto-confirm)
- [ ] Set `role = 'admin'` via SQL (disable/re-enable role trigger)

=> VERIFIED <=

### 1B. Login as Admin
- [ ] `/login` → "Email or Google" tab → email + password
- [ ] **EXPECT:** redirected to `/admin`
- [ ] **EXPECT:** stats grid shows 0 enrollments, 0 students, 0 courses

=> VERIFIED <=

### 1C. Create a Course
- [ ] `/admin/courses/new`
- [ ] Name: "SAT Math Foundations", Subject: `math`
- [ ] Start: **tomorrow**, End: **4 weeks from tomorrow**
- [ ] **EXPECT:** appears in `/admin/courses` list

=> VERIFIED <=

### 1D. Create Two Classes (same course)
- [ ] `/admin/classes/new` → **Class A**: link to course, group: `small`, capacity: **3**, Monday 4:00 PM
- [ ] `/admin/classes/new` → **Class B**: same course, group: `small`, capacity: **2**, Wednesday 4:00 PM
- [ ] **EXPECT:** both in `/admin/classes` list

=> VERIFIED <=

---

## Flow 2: Parent Signup + Add Children

### 2A. Sign Up as Parent
- [ ] `/signup` → select "Parent"
- [ ] Fill: name, email, phone (10+ digits), password
- [ ] **EXPECT:** redirected to `/parent`, empty state with "Add a Child" prompt

=> VERIFIED <=

### 2B. Add First Child (with login credentials)
- [ ] Click "Add a Child" → `/parent/add-child`
- [ ] Name: "Alice Test", Grade: 10
- [ ] Username: `alice_test`, Password: `test123`, Confirm password
- [ ] **EXPECT:** redirected to `/parent`, Alice card visible with 0 credits
- [ ] **EXPECT:** Alice card shows username `alice_test` + "Reset Password" button

=> VERIFIED <=

### 2C. Add Second Child
- [ ] Name: "Bob Test", Grade: 11, Username: `bob_test`, Password: `test456`
- [ ] **EXPECT:** two student cards on parent dashboard, both show usernames

=> VERIFIED <=

### 2D. Student Username Login
- [ ] Log out → `/login` → click **"Student Username"** tab
- [ ] Enter username: `alice_test`, password: `test123`
- [ ] **EXPECT:** redirected to `/student`
- [ ] **EXPECT:** student dashboard shows Alice's profile (view-only)

=> VERIFIED <= 

### 2E. Reset Child Password
- [ ] Log in as parent → parent dashboard
- [ ] Click "Reset Password" on Alice's card
- [ ] Enter new password: `newpass123`, confirm
- [ ] **EXPECT:** success message
- [ ] Log out → `/login` → "Student Username" tab → `alice_test` + `newpass123`
- [ ] **EXPECT:** successful login

=> VERIFIED <= 

---

## Flow 3: Enrollment (Direct Activation — no Stripe)

### 3A. Enroll Alice in Class A
- [ ] `/enroll` → see "SAT Math Foundations" with both classes
- [ ] Click Class A → `/enroll/<classA_id>`
- [ ] **EXPECT:** "3 seats available", agreement checkboxes visible
- [ ] Select: **Alice**, check both agreements, submit
- [ ] **EXPECT:** redirected to `/enroll/success?test_mode=true`
- [ ] **EXPECT:** parent dashboard → Alice shows active enrollment in Class A

=> VERIFIED <=

### 3B. Enroll Bob in Class A
- [ ] Same flow, select **Bob**
- [ ] **EXPECT:** success, Bob shows active enrollment

=> VERIFIED <=

### 3C. Public Offerings Page
- [ ] Open `/offerings` in **incognito** (no login)
- [ ] **EXPECT:** course visible with updated seat counts

=> VERIFIED <=

---

## Flow 4: Capacity Enforcement & Waitlist

### 4A. Enroll Alice in Class B (capacity 2)
- [ ] `/enroll/<classB_id>` → select Alice → enroll
- [ ] **EXPECT:** success (seat 1/2)

=> VERIFIED <=

### 4B. Enroll Bob in Class B
- [ ] `/enroll/<classB_id>` → select Bob → enroll
- [ ] **EXPECT:** success (seat 2/2 — **full**)

=> VERIFIED <=

### 4C. Create Second Parent + Child
- [ ] Log out → `/signup` → new parent (different email)
- [ ] Add child "Charlie Test" (username: `charlie_test`, password: `test789`)

=> VERIFIED <=

### 4D. Charlie Hits Full Class → Joins Waitlist
- [ ] `/enroll/<classB_id>` → select Charlie
- [ ] **EXPECT:** "Join Waitlist" shown instead of enroll button
- [ ] Click Join Waitlist
- [ ] **EXPECT:** redirected to `/enroll?waitlisted=<classB_id>`

=> VERIFIED <=

---

==> START FROM HERE NEXT <== 
## Flow 5: Refund → Waitlist Auto-Enroll Cascade
- [ ] Login as admin → `/admin/refunds`
- [ ] Find Bob's Class B enrollment
- [ ] **EXPECT:** refund type shows "Cancel (No Payment Found)" (no Stripe session)
- [ ] Process refund
- [ ] **EXPECT:** enrollment status → `canceled`

### 5B. Charlie Auto-Enrolled from Waitlist
- [ ] **NOTE:** Waitlist is **auto-enroll** — no manual claim step. When the seat opens, `auto_enroll_from_waitlist` runs immediately (belt-and-suspenders: also via cron every 5 min).
- [ ] **VERIFY (SQL):** `SELECT status FROM waitlist WHERE class_id = '<classB_id>' AND student_id = '<charlie_student_id>'` → `converted`
- [ ] **VERIFY (SQL):** `SELECT status FROM enrollments WHERE class_id = '<classB_id>' AND student_id = '<charlie_student_id>'` → `active`
- [ ] Login as Charlie's parent → parent dashboard
- [ ] **EXPECT:** Charlie shows active enrollment in Class B (auto-enrolled)
- [ ] **OPTIONAL:** visit `/enroll/waitlist-offer/<waitlistId>` → **EXPECT:** "You're Enrolled!" status message (info page only, no claim button)

==> VERIFIED: STUDENT DROPS CLASS & WAITLISTED STUDENT AUTO-ENROLLS CLASS
==>  

---

## Flow 6: Credits System (Auto-Issued via Cancellation)

### 6A. Cancel Alice's Session to Trigger Auto-Credit
- [ ] Login as first parent → `/parent/cancel-session`
- [ ] Cancel Alice's upcoming session in Class A (from Flow 3)
- [ ] Enter reason, submit
- [ ] **EXPECT:** cancellation created with `credit_deadline` = end-of-week Sunday 11:59:59 PM ET
- [ ] **Simulate deadline passing:**
  ```sql
  UPDATE session_cancellations
  SET credit_deadline = NOW() - INTERVAL '1 hour'
  WHERE id = (SELECT id FROM session_cancellations ORDER BY created_at DESC LIMIT 1);
  ```
- [ ] Run: `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/cancel-credits`
- [ ] **EXPECT:** credit auto-issued for Alice, type `small`
- [ ] Admin → `/admin/credits` → **EXPECT:** credit visible in history (read-only, no issuance form — credits are auto-issued only)

### 6B. Enroll with Auto-Issued Credit
- [ ] Admin: create course "SAT Reading" (future dates) + Class C (small, capacity 3)
- [ ] Login as first parent → `/enroll/<classC_id>` → select Alice → enroll
- [ ] **EXPECT:** redirected to `/enroll/success?paid_with_credits=true`
- [ ] **EXPECT:** parent dashboard → Alice credit balance decreased

### 6C. No Double-Spend
- [ ] Create another small class (Class D), enroll Alice
- [ ] **EXPECT:** no credits left → activates with `test_mode=true` (not `paid_with_credits`)

---

## Flow 7: Eligibility Guards

### 7A. Duplicate Enrollment Block
- [ ] Try to enroll Alice in Class A **again**
- [ ] **EXPECT:** error "Already enrolled in this class."

### 7B. Time Conflict
- [ ] Create another course (overlapping dates) with a class on **same day/time** as Class A (Monday 4 PM)
- [ ] Try to enroll Alice
- [ ] **EXPECT:** error "Time conflict with an existing enrollment."

### 7C. Re-enrollment Limit (max 3 per subject)
- [ ] Refund Alice from Class A → re-enroll → refund → re-enroll → refund → attempt 4th
- [ ] **EXPECT:** error about re-enrollment limit exceeded

### 7D. Class-Blocked Re-enrollment (Phase 2 Drop)
- [ ] After a Phase 2 drop (see Flow 14B), try to re-enroll same student in **same class**
- [ ] **EXPECT:** error "Re-enrollment into this class is not available. You may enroll in a different section."
- [ ] Enroll in a **different class** for same course → **EXPECT:** success

---

## Flow 8: Performance Logging

### 8A. Log Session Data
- [ ] Admin → `/admin/performance`
- [ ] Select Class A, week 1, session 1
- [ ] **EXPECT:** Alice and Bob listed (enrolled students)
- [ ] Alice: present + HW done | Bob: absent + HW not done
- [ ] Save
- [ ] **EXPECT:** success message

> Future: integrate with Google Forms (HW) + Google Meet (attendance)

### 8B. Dashboard Reflects Data
- [ ] Login as first parent → parent dashboard
- [ ] **EXPECT:** Alice: 1/1 attendance, 1/1 HW | Bob: 0/1 attendance, 0/1 HW
- [ ] Login as Alice (student username) → `/student`
- [ ] **EXPECT:** session grid shows attendance + homework status for session 1

### 8C. Idempotent Re-submit
- [ ] Admin: log same session again with flipped data
- [ ] **EXPECT:** updates in place, no duplicate rows

> Phase 1 scope: basic attendance + HW tracking. Monthly performance report PDF is a future item.

=> NEED integration with Google Forms 

---

## Flow 9: Session Cancellation + Makeup

### 9A. Cancel Alice's Session
- [ ] Login as first parent → `/parent/cancel-session`
- [ ] Select Alice's upcoming session in Class A
- [ ] Enter reason, submit
- [ ] **EXPECT:** success + **"Find Alternate Session"** link in cancellation history (small group) + message says "by end of this week (Sunday)"
- [ ] **NOTE:** cancellation history is shown on parent dashboard under student cards — the "Find Alternate" link persists until the credit deadline passes

### 9B. Book Alternate Session
- [ ] Click "Find Alternate Session" → `/parent/cancel-session/alternate?cancellation_id=<id>`
- [ ] **EXPECT:** lists other small-group classes for same course, same week
- [ ] If Class B has capacity → book it
- [ ] **EXPECT:** cancellation status → `rescheduled`
- [ ] **NOTE:** link works anytime before credit deadline, not just immediately after cancelling

### 9C. Cancel Makeup Booking
- [ ] From cancellation history on parent dashboard, cancel the makeup booking
- [ ] **EXPECT:** status reverts to `cancelled`, alternate seat freed
- [ ] **EXPECT:** credit deadline still ticking (can still find another alternate or wait for auto-credit)

### 9D. Auto-Credit via Cron
- [ ] **Simulate deadline passing:** update `credit_deadline` in SQL to past timestamp
  ```sql
  UPDATE session_cancellations
  SET credit_deadline = NOW() - INTERVAL '1 hour'
  WHERE id = '<cancellation_id>';
  ```
- [ ] Run: `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/cancel-credits`
- [ ] **EXPECT:** credit auto-issued to Alice for `small` group type
- [ ] **NOTE:** credit_deadline is end-of-week Sunday 11:59:59 PM ET
- [ ] **VERIFY (SQL):** `SELECT * FROM credits WHERE student_id = '<alice_students_id>' ORDER BY created_at DESC LIMIT 1`

### 9E. Makeup No-Show Reverts Cancellation
- [ ] Book a makeup for Alice (from 9B), then set `session_date` to yesterday in SQL:
  ```sql
  UPDATE makeup_bookings SET session_date = CURRENT_DATE - 1
  WHERE cancellation_id = '<cancellation_id>';
  ```
- [ ] Run: `curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/cancel-credits`
- [ ] **EXPECT:** makeup_bookings status → `no_show`
- [ ] **EXPECT:** session_cancellations status → `cancelled` (reverted from `rescheduled`)
- [ ] **EXPECT:** credit deadline still ticking — will auto-issue credit when deadline passes

### 9F. Makeup Waitlist Auto-Book
- [ ] Fill the alternate class to capacity (enroll enough students)
- [ ] Cancel Alice's session → "Find Alternate" → **EXPECT:** alternate class is full, "Join Makeup Waitlist" button shown
- [ ] Join makeup waitlist
- [ ] Drop/refund one student from the alternate class
- [ ] **EXPECT:** `auto_book_makeup_from_waitlist` fires → Alice auto-booked into alternate
- [ ] **VERIFY (SQL):** `SELECT status FROM makeup_waitlist WHERE student_id = '<alice_student_id>'` → `converted`
- [ ] **EXPECT:** parent dashboard shows notification about auto-booked makeup

---

## Flow 10: Student Access

### 10A. Independent Student Signup (Google OAuth)
- [ ] `/signup` → select "Student" → "Sign up with Google"
- [ ] Complete Google OAuth
- [ ] **EXPECT:** redirected to `/onboarding?role=student`
- [ ] **EXPECT:** role field is **locked** (cannot change to parent/admin)
- [ ] Enter name, phone (optional), submit
- [ ] **EXPECT:** redirected to `/student`

### 10B. Parent-Added Student Login (Username)
- [ ] `/login` → click **"Student Username"** tab
- [ ] Enter Alice's username + password (from Flow 2B)
- [ ] **EXPECT:** redirected to `/student`

### 10C. Student Dashboard (View-Only)
- [ ] **EXPECT:** profile visible at top
- [ ] **EXPECT:** notifications section (with "Mark Read" button for unread)
- [ ] **EXPECT:** active enrollments showing:
  - Course name, subject, level, dates
  - Meeting day/time
  - Google Classroom link (if configured)
  - Google Meet link (if configured)
  - 8-session attendance/homework grid
- [ ] **EXPECT:** office hours section (if admin has set any)
- [ ] **EXPECT:** message form to contact tutor

### 10D. Student Sends Message
- [ ] Type message in message form, submit
- [ ] Login as admin → `/admin/messages`
- [ ] **EXPECT:** message from student visible

### 10E. Student Cannot Enroll or Cancel
- [ ] Logged in as student → navigate to `/enroll`
- [ ] **EXPECT:** redirected to `/student` (enrollment is parent-only)
- [ ] Navigate to `/parent/cancel-session`
- [ ] **EXPECT:** redirected away (cancellation is parent-only)

---

## Flow 11: Audit Trail & Export

### 11A. Audit Logs
- [ ] Admin → `/admin/logs`
- [ ] **EXPECT:** entries for: credit issuance, refunds, performance logs, enrollment activations, enrollment drops (with phase info)

### 11B. CSV Export
- [ ] Admin → `/admin/export`
- [ ] Export each: enrollments, performance, credits, students
- [ ] **EXPECT:** CSV downloads with correct row counts and data

---

## Flow 12: Security Checks

### 12A. Cross-Role Route Block
- [ ] Logged in as parent → navigate to `/admin`
- [ ] **EXPECT:** redirected to `/parent`

### 12B. Admin Can't Enroll
- [ ] Logged in as admin → navigate to `/enroll`
- [ ] **EXPECT:** redirected to `/admin`

### 12C. Ownership Violation
- [ ] In browser DevTools, modify the student `<select>` value to a UUID not belonging to you
- [ ] Submit enrollment
- [ ] **EXPECT:** error about unauthorized access

### 12D. Unauthenticated Access
- [ ] Clear all cookies → navigate to `/parent`
- [ ] **EXPECT:** redirected to `/login?redirectTo=/parent`

### 12E. Admin Self-Signup Block
- [ ] Attempt signup with role somehow set to `admin`
- [ ] **EXPECT:** error "Admin accounts cannot be self-created"

---

## Flow 13: Parent Refund Booking Flow

### 13A. Refund Page Shows Consultation Link
- [ ] Login as parent → `/parent/refund`
- [ ] **EXPECT:** heading "Refunds", explanation text about case-by-case
- [ ] **EXPECT:** "Schedule a Consultation" link pointing to `/book`
- [ ] **EXPECT:** no form, no enrollment picker, no request history

### 13B. Consultation Link Works
- [ ] Click "Schedule a Consultation"
- [ ] **EXPECT:** `/book` page with heading "Book a Consultation" (generic, no student context)
- [ ] **NOTE:** Phase 3 drops (Flow 14C) also link to `/book` but with student/class context pre-filled

---

## Flow 14: 3-Phase Drop Class System

### 14A. Phase 1 — Self-Serve Drop (>7 days before start)
- [ ] Admin: create course with `start_date` 14+ days from now + class
- [ ] Enroll a child (Alice) in the class
- [ ] Login as parent → `/parent/drop-class?student=<alice_student_id>`
- [ ] **EXPECT:** "Drop This Class" button (red border, Phase 1 form)
- [ ] Click → confirm with reason → submit
- [ ] **EXPECT:** redirected to `/parent?dropped=1`
- [ ] **EXPECT:** enrollment status = `canceled`, `class_blocked = false`
- [ ] Re-enroll Alice in same class → **EXPECT:** success (re-enrollment allowed)

### 14B. Phase 2 — Note Drop (≤7 days before start → 7 days after first session)
- [ ] Admin: create course with `start_date` = 3 days from now (or today) + class (e.g. Monday meeting)
- [ ] Enroll Alice in the class
- [ ] Login as parent → `/parent/drop-class?student=<alice_student_id>`
- [ ] **EXPECT:** "Drop This Class" button → reveals warning: "You will not be able to re-enroll in this section" + required textarea
- [ ] Enter note, submit
- [ ] **EXPECT:** redirected to `/parent?dropped=1`
- [ ] **VERIFY (SQL):** `SELECT class_blocked FROM enrollments WHERE id = '<enrollment_id>'` → `true`
- [ ] Try to re-enroll Alice in **same class** → **EXPECT:** error "Re-enrollment into this class is not available. You may enroll in a different section."
- [ ] Try to enroll Alice in **different class** for same course → **EXPECT:** success

### 14C. Phase 3 — Refund Consultation (>7 days after first session)
- [ ] Admin: create course with `start_date` 14+ days ago + class
- [ ] Enroll Alice (admin override or set dates after enrollment)
- [ ] Login as parent → `/parent/drop-class?student=<alice_student_id>`
- [ ] **EXPECT:** amber box with "schedule a refund consultation" link
- [ ] **EXPECT:** link = `/book?student=Alice&class=<course_name>&enrollment=<id>`
- [ ] Click link
- [ ] **EXPECT:** `/book` page shows "Request Refund Consultation" heading
- [ ] **EXPECT:** blue context banner: "Refund consultation for Alice — <course_name>"
- [ ] Complete booking flow (pick date → time → enter info → submit)
- [ ] **VERIFY (DB):** `SELECT student_name, class_name FROM bookings ORDER BY created_at DESC LIMIT 1` → populated

### 14D. RPC Server-Side Enforcement
- [ ] Attempt Phase 1 drop via RPC when `daysUntilStart <= 7` → **EXPECT:** error
- [ ] Attempt Phase 2 drop via RPC when `daysSinceFirstSession > 7` → **EXPECT:** error "Phase 2 drop window has passed"
- [ ] Attempt Phase 3 drop as non-admin → **EXPECT:** error "Cannot self-drop in Phase 3"
- [ ] Admin can drop in any phase via RPC → **EXPECT:** success regardless of timing

---

## Flow 15: Parent Child Management

### 15A. Setup Login for Existing Child (placeholder credentials)
- [ ] If a child was created before the username system (or has placeholder creds):
- [ ] Login as parent → parent dashboard → click "Set Up Login" on the child's card
- [ ] **EXPECT:** redirected to `/parent/setup-login?student_id=<id>`
- [ ] Enter username + password
- [ ] **EXPECT:** success → child card now shows username + "Reset Password" button instead of "Set Up Login"

### 15B. Reset Child Password
- [ ] Login as parent → parent dashboard → click "Reset Password" on a child's card
- [ ] Enter new password + confirm
- [ ] **EXPECT:** success message
- [ ] Log out → `/login` → "Student Username" tab → child's username + new password
- [ ] **EXPECT:** successful login

---

## Priority Tiers

| Tier | Flows | Notes |
|------|-------|-------|
| **P0 — Must Pass** | 1, 2, 3, 4, 5, 6 | Core enrollment + payment + auto-enroll waitlist loop |
| **P1 — Should Pass** | 7, 8, 9, 14 | Guards, data logging, cancel/makeup, drop phases |
| **P2 — Nice to Pass** | 10, 11, 12, 13, 15 | Student access, audit, security, refund booking, child management |

**Total checkboxes: ~115**

---

## Quick SQL Helpers

```sql
-- See all enrollments (with class_blocked)
SELECT e.id, u.full_name, c.name as course, cl.meeting_day, e.status, e.class_blocked
FROM enrollments e
JOIN students s ON s.id = e.student_id
JOIN users u ON u.id = s.user_id
JOIN classes cl ON cl.id = e.class_id
JOIN courses c ON c.id = cl.course_id
ORDER BY e.created_at DESC;

-- See waitlist state
SELECT w.id, u.full_name, w.status, w.notified_at
FROM waitlist w
JOIN students s ON s.id = w.student_id
JOIN users u ON u.id = s.user_id
ORDER BY w.created_at DESC;

-- See credit balances
SELECT u.full_name, cr.group_size_type, cr.amount, cr.remaining_amount, cr.expires_at
FROM credits cr
JOIN students s ON s.id = cr.student_id
JOIN users u ON u.id = s.user_id
WHERE cr.remaining_amount > 0
ORDER BY cr.created_at DESC;

-- See cancellations + makeup bookings
SELECT sc.id, u.full_name, sc.session_number, sc.status, sc.credit_deadline,
       mb.alternate_class_id
FROM session_cancellations sc
JOIN enrollments e ON e.id = sc.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN users u ON u.id = s.user_id
LEFT JOIN makeup_bookings mb ON mb.cancellation_id = sc.id
ORDER BY sc.created_at DESC;

-- See bookings with refund context
SELECT b.parent_name, b.parent_email, b.datetime, b.student_name, b.class_name
FROM bookings b
ORDER BY b.created_at DESC;

-- See student usernames
SELECT u.full_name, u.username, u.role, s.id as student_id, s.parent_id
FROM users u
JOIN students s ON s.user_id = u.id
ORDER BY u.created_at DESC;

-- Reset for fresh testing (DESTRUCTIVE)
TRUNCATE enrollments CASCADE;
TRUNCATE waitlist CASCADE;
TRUNCATE credits CASCADE;
TRUNCATE session_cancellations CASCADE;
TRUNCATE makeup_bookings CASCADE;
TRUNCATE makeup_waitlist CASCADE;
TRUNCATE performance_logs CASCADE;
TRUNCATE admin_logs CASCADE;
TRUNCATE notifications CASCADE;
```
