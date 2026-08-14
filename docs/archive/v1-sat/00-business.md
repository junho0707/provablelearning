# L0 — Business

What ProvableLearning sells, and the promises the system makes to deliver it. Plain English. No implementation. This is the doc to read first.

## What we sell

**Standing tutoring appointments.** A student picks one (Large Group) or two (Small Group / 1:1) recurring weekly time slots. They pay for a month at a time. The seat is theirs for that month. If they can't attend a session, the system helps them reclaim equivalent capacity elsewhere.

| Group size | Class size | Sessions / week | Session length | Price / month |
|---|---|---|---|---|
| Large Group (LG) | many | 2 (fixed schedule) | 1.5 hr | $20 |
| Small Group (SG) | 1–3 (depends on signups) | 2 (student picks slots) | 1.5 hr | $300 |
| 1:1 | 1 | 2 (student picks slots) | 1.5 hr | $600 |

The "month" is rolling: it starts on the student's chosen `student_start_date`. The 8 regular sessions (4 for single-slot LG) fall within the first 4 weeks; the enrollment window runs 35 days total, leaving a ~5th week in which missed sessions can be made up.

## Capabilities

Six promises, each named after the user-intent arc it serves. Every journey the system supports realizes one of these. Vendor-agnostic — these stay true even if the underlying tech changes.

Each capability lists the sub-capabilities that compose it, so you can check off what's actually built per area.

---

### 1. Enrollment

**Without this, the system doesn't exist.** This is the core transaction and everything that protects the value of the seat-month the family bought.

**Buying a seat**
- Browse the public catalog of offerings (LG schedules; SG / 1:1 slot grids).
- Reserve a recurring weekly slot — one slot for LG, two for SG / 1:1 — with eligibility checks (no double-booking, no time conflicts, capacity available).
- Pay at checkout (Stripe) **or** pay later — pay-later deadline is **7 days after the enrollment's start date**; an auto-unenroll job cancels unpaid past deadline.
- Subject is chosen at enrollment (SG / 1:1 slots are subject-agnostic time slots); LG class encodes its own subject.

**Waitlist (when the slot is full)**
- Join the waitlist for a specific class (LG) or for a set of preferred SG slots.
- FIFO auto-enrollment when a seat opens, with notification to the next person in line.

**Recovering a missed session (SG / 1:1 only — LG sessions are not recoverable)**
- **Pre-cancel path:** family cancels a session ahead of time, then books a makeup into any compatible open slot inside the enrollment window.
- **No-show path:** if the student simply misses a session, the admin marks them absent — the absence surfaces on the parent's (or independent student's) dashboard as a directly-bookable makeup (no excuse note required).
- Cancel a booked makeup and re-book a different one.
- Makeup-waitlist: join the waitlist for a desired makeup slot if it's full, with FIFO auto-booking when capacity opens.
- Redeem an admin-issued credit as a makeup (credit is a separate, admin-only refund instrument — see Operations).

**Exiting the enrollment**
- **Self-drop**, allowed only **more than 7 days before the start date** and only if unpaid.
- **Admin-facilitated drop** in the ±7-day window around the start date (paid families can't self-drop here — must request).
- **Refund consultation** is the only path after start_date + 7 days.

---

### 2. Learning record

**Why it's a capability, not bookkeeping:** parents are paying for outcomes. The performance log is the only direct evidence the system surfaces of work being done.

**Per-session recording (admin write side)**
- Record attendance per enrolled student: present / absent / makeup / excused.
- Record homework status per enrolled student: done / partial / not done.
- One performance row per (student, class, session) — uniqueness enforced.

**Absence → recovery link (SG / 1:1)**
- Marking a student absent automatically creates a directly-bookable makeup row on the family's dashboard (tagged so the UI still shows "Absent" on the original session for accountability).
- LG absences get no makeup — they are recorded only.

**Family-facing history (read side)**
- Parent (or independent student) sees the full attendance + homework log across all of their / their children's enrollments.
- Visible per-session indicators distinguish attended, cancelled, makeup-booked, and absent states.

---

### 3. Family

**Why the split matters:** payment authorization belongs to the parent. A 14-year-old should not be able to drop a $600 enrollment.

**Parent-only actions**
- Add a child to the account.
- Remove a child.
- Reset a child's password.
- Enroll a child, drop an enrollment, change payment.

**Shared visibility**
- Parent sees every child's enrollments, sessions, payments, credits, notifications in one dashboard.
- Independent student (no parent) has the same dashboard surface, but acts on their own behalf.

**Dependent-child capabilities (logistics only)**
- Cancel a session.
- Book / cancel a makeup.
- Redeem a credit.
- Cannot enroll, drop, or modify payment.

---

### 4. Communication

**Why it's a capability:** the family needs to trust that important events (a waitlist seat opening up, a payment deadline approaching) will reach them without checking the dashboard.

**Outbound notifications (email + SMS)**
- Payment confirmation.
- Waitlist offer (enrollment waitlist).
- Makeup-waitlist offer (auto-booked confirmation).
- Session reminders (upcoming session).
- Makeup confirmation.
- Refund decision (approved / denied).
- Payment-deadline approaching (pay-later).

**Messaging surface**
- Parent or independent student exchanges messages with the tutor for one-off conversations.
- Admin reads and replies in a grouped-by-conversation view.

---

### 5. Acquisition

**Why it's a capability:** the system has to support a clean path from "first time hearing about us" to "first enrollment" without an admin doing any manual work.

**Pre-account discovery**
- Public marketing site reachable by anyone.
- Offerings catalog visible without an account.
- Book a free consultation ad-hoc (no signup required).

**Account creation**
- Sign up with email + password.
- Sign up with Google OAuth (identity auto-linking for child accounts by email match).
- Onboarding completes role (parent / student / independent student) and phone number before dashboard access.

**Hand-off to Enrollment**
- After onboarding, the user lands on the dashboard ready to enroll (no admin step required).

---

### 6. Operations

**Why it's a capability:** without this, the admin lives in spreadsheets, can't defend a contested decision, and the system is a half-tool.

**Supply (managing what's offered)**
- Create / edit / retire classes.
- Set capacity per class.
- Auto-create Google Classroom + Google Calendar artifacts (1 classroom per LG class; per-student classroom for SG / 1:1).

**Cases (handling individual situations)**
- Approve / deny refund requests (including refund-as-credit issuance).
- Issue credits manually (only by admin, only via refund approval).
- Review makeup requests / verify makeup waitlist bookings.
- Log per-session performance (attendance + homework).

**Cross-cutting data access**
- Read every family's enrollments, sessions, payments, credits, messages.

**Paper trail**
- Every state-changing action is logged with actor + timestamp + entity reference.
- CSV exports for enrollments, performance, credits.
- Monthly per-student progress reports.

---

## Capability → journey map

The 6 capabilities are realized by 13 user-intent journeys. Each journey is documented in `journeys/`.

| Capability | Journeys |
|---|---|
| 1. Enrollment | Enroll · Cancel a session · Cancel a makeup · Redeem a credit · End enrollment |
| 2. Learning record | Handle students (admin write side) · View my data (family read side) |
| 3. Family | Family management · View my data |
| 4. Communication | Messaging · (notifications fire as side-effects from every journey) |
| 5. Acquisition | Discover & sign up · Book ad-hoc |
| 6. Operations | Run classes · Handle students · Operate |

Notes:
- *View my data* appears under both *Learning record* and *Family* — it's the read surface for both.
- *Handle students* appears under both *Learning record* (performance write) and *Operations* (refunds / credits / makeups). It's a multi-purpose admin surface.
- Notifications aren't a journey of their own; they're a side-effect of state changes in other journeys.
