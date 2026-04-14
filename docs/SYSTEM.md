# ProvableLearning — System Document

> Last updated: 2026-03-11
> Purpose: Reference for understanding how every feature works, what files implement it, and how to modify it.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [Class Management](#3-class-management)
4. [Enrollment Flow](#4-enrollment-flow)
5. [Payment System](#5-payment-system)
6. [Session Scheduling](#6-session-scheduling)
7. [Cancellation & Makeup System](#7-cancellation--makeup-system)
8. [Credits System](#8-credits-system)
9. [Waitlist System](#9-waitlist-system)
10. [Drop Class (3-Phase)](#10-drop-class-3-phase)
11. [Google Workspace Integration](#11-google-workspace-integration)
12. [Booking (Consultations)](#12-booking-consultations)
13. [Admin Dashboard](#13-admin-dashboard)
14. [Notifications & Messaging](#14-notifications--messaging)
15. [Cron Jobs](#15-cron-jobs)
16. [Database Schema Summary](#16-database-schema-summary)

> For module layout, API groups, crons, and dependency flow between libraries, see `ARCHITECTURE.md` (C4).

---

## 1. Architecture Overview

**Stack**: Next.js 15 (App Router, `src/` directory) · Supabase (Postgres + Auth + RLS + RPCs) · Stripe · Google Workspace (Calendar + Classroom) · Tailwind v4 · TypeScript (strict) · Zod

**Business model**: SAT tutoring platform with 3 tiers:
| Tier | Price | Sessions | Duration | Makeups |
|------|-------|----------|----------|---------|
| Large Group (LG) | $20/mo | 2x/wk fixed | 1.5hr | Watch recording; no credits |
| Small Group (SG) | $300/mo | 2 slots/wk (pick) | 1.5hr | Any SG slot; credits if missed |
| 1-on-1 | $800/mo | 2x/wk | 1.5hr | Any 1:1 slot; credits if missed |

**Key design decisions**:
- **Subject on enrollment, not class**: SG/1:1 classes are subject-agnostic time slots. Subject (`subject_category` + `subject_detail`) stored on the enrollment record.
- **Dual-slot enrollment**: Each SG/1:1 enrollment has `slot_1_class_id` + `slot_2_class_id` (+ `slot_3_class_id` for future 3x/wk).
- **Rolling enrollment**: SG/1:1 students have `student_start_date` / `student_end_date` (start + 1 month). LG uses fixed `class_start_date`.
- **No courses table**: Classes are standalone. Regular slots serve as makeups.
- **All critical writes via Postgres RPCs**: `reserve_seat`, `apply_credits`, `book_makeup_session`, `cancel_makeup_booking`, etc. — atomic with row-level locking.

---

## 2. Authentication & Authorization

### High-level flow
1. User signs up via **email+password** or **Google OAuth**
2. On first login, user completes **onboarding** (name, phone, role: parent/student)
3. Middleware enforces route protection and role-based access

### How it works

**Signup** (`src/app/(auth)/signup/`):
- Email+password: `supabase.auth.signUp()`. If email already registered with Google, attempts identity linking via admin API.
- Google OAuth: redirects to Google, callback at `/callback`.

**Login** (`src/app/(auth)/login/`):
- Email+password: `supabase.auth.signInWithPassword()`. Detects Google-only accounts and shows helpful message.
- Google OAuth: `supabase.auth.signInWithOAuth()` → callback.

**Callback** (`src/app/(auth)/callback/route.ts`):
- Exchanges auth code for session.
- Auto-links: if new OAuth user's email matches a pre-registered student (without `user_id`), creates `users` row and links the student record.
- Redirects to `/onboarding` if profile incomplete.

**Onboarding** (`src/app/(auth)/onboarding/page.tsx`):
- Collects: full_name, phone (optional), grade (students), role choice.
- Creates `users` row and optionally `students` row for independent students.

**Middleware** (`src/middleware.ts`):
- Public paths: `/`, `/login`, `/signup`, `/callback`, `/api/webhooks/stripe`, `/api/cron`, `/api/bookings`, `/book`, `/offerings`
- Authenticated users without profile → forced to `/onboarding`
- Role-based: `/admin/*` for admins, `/parent/*` for parents, `/student/*` for students, `/enroll/*` for parent+student

### Files to edit
| What | File |
|------|------|
| Login UI/logic | `src/app/(auth)/login/page.tsx`, `actions.ts` |
| Signup UI/logic | `src/app/(auth)/signup/page.tsx`, `actions.ts` |
| OAuth callback | `src/app/(auth)/callback/route.ts` |
| Onboarding | `src/app/(auth)/onboarding/page.tsx` |
| OAuth helper | `src/lib/auth/google-oauth.ts` |
| Route protection | `src/middleware.ts` |

---

## 3. Class Management

### High-level flow
Admin creates classes → classes appear in enrollment browser → students enroll.

### How it works

**Creating a class** (`src/app/(dashboard)/admin/classes/actions.ts`):
- **LG**: Single class with subject + level + 2 meeting days. Creates Google Calendar recurring event + Google Classroom.
- **SG/1:1**: Batch creation — one class per time slot (subject/level = NULL, subject-agnostic). Creates calendar blocks with rolling UNTIL date.
- Zod validation: `src/lib/validators/class.ts` — enforces capacity ranges per group size, prevents subject on SG/1:1.

**Editing a class** (`admin/classes/[id]/edit-form.tsx`):
- Validates capacity reduction against active enrollment count.
- Prevents dangerous group_size_type changes.

**Deleting a class** (`admin/classes/[id]/delete-button.tsx`):
- Blocked if enrollments, cancellations, or makeup bookings reference it.
- Cleans up waitlist entries, Google Calendar, and Google Classroom.

### Files to edit
| What | File |
|------|------|
| Create/update/delete actions | `src/app/(dashboard)/admin/classes/actions.ts` |
| Class form (new) | `src/app/(dashboard)/admin/classes/new/form.tsx` |
| Class detail/edit | `src/app/(dashboard)/admin/classes/[id]/page.tsx`, `edit-form.tsx` |
| Class list | `src/app/(dashboard)/admin/classes/page.tsx` |
| Zod validator | `src/lib/validators/class.ts` |
| Capacity constants | `src/lib/constants.ts` → `GROUP_SIZE_RANGES` |

---

## 4. Enrollment Flow

### High-level flow
Student/parent browses classes → selects 2 slots (SG/1:1) or 1 class (LG) → chooses subject → pays now or later → enrolled.

### How it works

**Browse** (`src/app/(dashboard)/enroll/page.tsx`):
- Shows all active classes grouped by group_size_type.
- Links to per-class enrollment page.

**Eligibility check** (`src/lib/enrollment/check-eligibility.ts`):
- No duplicate enrollment in same class (checks all slot columns).
- No time conflicts (same meeting_day + meeting_time).
- Capacity check.
- Enrollment window validation.

**Enrollment form** (`src/app/(dashboard)/enroll/[classId]/enroll-form.tsx`):
- SG/1:1: shows subject picker (`subject_category` + optional `subject_detail` for general_math). Requires 2nd slot selection.
- LG: no subject picker, single class.
- Computes valid `student_start_date` options based on slot_1's meeting day.
- Submits to `enrollAction` server action.

**Reserve seat** (`src/lib/enrollment/reserve.ts`):
- Calls `reserve_seat` Postgres RPC with `FOR UPDATE` row lock on both slot classes.
- RPC validates: capacity, group_size_type match between slots, class active, enrollment window.
- Creates enrollment with: `class_id = slot_1_class_id`, `slot_1_class_id`, `slot_2_class_id`, subject fields, `student_start_date`, `student_end_date`.

**Post-reserve** (`src/app/(dashboard)/enroll/[classId]/actions.ts`):
- Pay Now: creates Stripe Checkout → redirect to Stripe.
- Pay Later: `reserve_seat(p_pay_later=true)` → enrollment active+unpaid, payment_deadline = start + 7 days.
- Google Classroom: creates per-student classroom for SG/1:1 (or uses per-class for LG).

### Files to edit
| What | File |
|------|------|
| Browse classes | `src/app/(dashboard)/enroll/page.tsx` |
| Enrollment page | `src/app/(dashboard)/enroll/[classId]/page.tsx` |
| Enroll form | `src/app/(dashboard)/enroll/[classId]/enroll-form.tsx` |
| Server action | `src/app/(dashboard)/enroll/[classId]/actions.ts` |
| Eligibility logic | `src/lib/enrollment/check-eligibility.ts` |
| Reserve seat | `src/lib/enrollment/reserve.ts` |
| Constants (prices) | `src/lib/constants.ts` → `PRICES`, `getPriceForEnrollment()` |
| Reserve RPC | `supabase/migrations/00083_subject_agnostic_sg_rework.sql` (latest) |

---

## 5. Payment System

### High-level flow
Pay Now → Stripe Checkout → webhook activates enrollment.
Pay Later → active+unpaid → must pay within 7 days or auto-unenrolled.

### How it works

**Stripe Checkout** (`src/lib/stripe/create-checkout.ts`):
- Creates session with `expires_at` (API version `2026-01-28.clover`).
- 30-minute checkout window (`PENDING_ENROLLMENT_TTL_MINUTES`).
- Metadata: `enrollment_id`, `student_id`, `class_id`.

**Webhook** (`src/app/api/webhooks/stripe/route.ts`):
- `checkout.session.completed` → activates enrollment, invites to Google Classroom.
- `checkout.session.expired` → if pending, reverses credits + deletes enrollment + cascades waitlist.
- `checkout.session.async_payment_succeeded` → handles deferred ACH.
- `checkout.session.async_payment_failed` → treats as expired.

**Auto-unenroll cron** (`src/app/api/cron/auto-unenroll/route.ts`):
- Daily: finds active+unpaid enrollments past `payment_deadline`.
- Cancels enrollment, sends notification, removes from Google Classroom, cascades waitlist.

**Reconciliation** (`src/lib/stripe/webhook-handlers.ts` → `reconcileStripePayments()`):
- Catches missed webhooks: checks stale pending enrollments, verifies payment status against Stripe API.

### Files to edit
| What | File |
|------|------|
| Checkout creation | `src/lib/stripe/create-checkout.ts` |
| Prices | `src/lib/stripe/prices.ts`, `src/lib/constants.ts` |
| Webhook handler | `src/app/api/webhooks/stripe/route.ts` |
| Webhook logic | `src/lib/stripe/webhook-handlers.ts` |
| Auto-unenroll | `src/app/api/cron/auto-unenroll/route.ts` |

---

## 6. Session Scheduling

### High-level flow
Each enrollment maps to 8 sessions/month (4 per slot). Session dates are computed from class meeting days + student start date.

### How it works

**Session computation** (`src/lib/scheduling/session-dates.ts`):
- `computeSessionDates(meetingDay, startDate, count)`: generates weekly dates from start.
- `computeEnrollmentSessions(enrollment)`:
  - **2-slot** (SG/1:1): 8 sessions total. Odd sessions (1,3,5,7) → slot_1, even (2,4,6,8) → slot_2. Interleaved chronologically.
  - **3-slot**: 12 sessions. Round-robin across 3 slots.
  - **LG (1-slot, 2 meeting days)**: 8 sessions (4 per meeting day), sorted chronologically.
- Start date: `student_start_date` for SG/1:1, `class_start_date` for LG.
- `SESSIONS_PER_SLOT = 4` (1 month ≈ 4 weeks).

### Files to edit
| What | File |
|------|------|
| Session date logic | `src/lib/scheduling/session-dates.ts` |
| Sessions per slot | `src/lib/constants.ts` → `SESSIONS_PER_SLOT` |
| Session durations | `src/lib/constants.ts` → `SESSION_DURATION_HOURS` |

---

## 7. Cancellation & Makeup System

### High-level flow
Student cancels a session → system finds available makeup slots (same group_size_type, any subject) → student books one. If no slots available, joins makeup waitlist. If not made up by Sunday 11:59 PM, credit auto-issued (SG/1:1 only; LG gets no credit).

### How it works

**Cancel session** (`src/app/(dashboard)/parent/cancel-session/` or `student/cancel-session/`):
- Page shows cancellable sessions (computed from enrollment sessions minus already-cancelled/past).
- LG enrollments excluded (LG: watch recording, no cancellation system).
- Submit calls `cancelSession()` → creates `session_cancellations` row with status `'cancelled'`.
- Post-cancel routes: SG → alternate session picker, 1:1 → reschedule widget.

**Find alternate sessions** (`src/lib/cancellation/find-alternate-sessions.ts`):
- Finds all classes with same `group_size_type` (subject-agnostic).
- Computes available sessions per class, accounting for enrolled students + booked makeups.
- Respects enrollment window and class end_date.
- Returns sessions grouped by week with capacity info.

**Book makeup** (`src/lib/cancellation/book-makeup.ts`):
- Calls `book_makeup_session` RPC with `p_session_date`.
- RPC validates: group_size_type match, different class, capacity, not past.
- On success: inserts notification, invites to Google Classroom.

**1:1 Reschedule** (`src/app/(dashboard)/_components/reschedule-widget.tsx` + `src/app/api/cancellations/reschedule/`):
- Generates 1-hour slots (9am–5pm ET, weekdays, next 2 weeks).
- Checks Google Calendar free/busy.
- Creates calendar event on confirmation.

**Cancel makeup** (`src/lib/cancellation/cancel-makeup.ts`):
- Calls `cancel_makeup_booking` RPC.
- Auto-books next person from makeup waitlist.

**Makeup waitlist** (`src/lib/cancellation/join-makeup-waitlist.ts`):
- Joins makeup waitlist for a specific session when it's full.
- Auto-booked when a cancellation frees a spot.

**Auto-book from waitlist** (`src/lib/cancellation/auto-book-makeup.ts`):
- Called when a makeup is cancelled.
- Executes `auto_book_makeup_from_waitlist` RPC (FIFO).

### Files to edit
| What | File |
|------|------|
| Cancel session UI | `src/app/(dashboard)/parent/cancel-session/page.tsx` (and student equivalent) |
| Cancel form component | `src/app/(dashboard)/_components/cancel-session-form.tsx` |
| Find alternates | `src/lib/cancellation/find-alternate-sessions.ts` |
| Alternate picker UI | `src/app/(dashboard)/_components/alternate-session-picker.tsx` |
| Book makeup | `src/lib/cancellation/book-makeup.ts` |
| Cancel makeup | `src/lib/cancellation/cancel-makeup.ts` |
| Join makeup waitlist | `src/lib/cancellation/join-makeup-waitlist.ts` |
| Auto-book | `src/lib/cancellation/auto-book-makeup.ts` |
| 1:1 reschedule widget | `src/app/(dashboard)/_components/reschedule-widget.tsx` |
| Reschedule API | `src/app/api/cancellations/reschedule/route.ts` |
| Reschedule slots API | `src/app/api/cancellations/alternate-sessions/route.ts` |
| Credit-based picker | `src/app/(dashboard)/_components/credit-makeup-picker.tsx` |
| RPCs | `supabase/migrations/00088_expand_makeup_window.sql` |

---

## 8. Credits System

### High-level flow
Credits are for makeups only (not enrollment). Issued when a cancelled session isn't made up by end of week (SG/1:1 only). Student redeems credit to book any same-group-size makeup.

### How it works

**Credit issuance**: Handled by cancel-credits cron (see Cron Jobs section).

**Check balance** (`src/lib/credits/get-balance.ts`):
- Queries `credits` table where `remaining_amount > 0` and not expired.
- Groups by `group_size_type`.

**Find sessions for credit** (`src/lib/credits/find-sessions-for-credit.ts`):
- Finds available makeup slots matching the credit's group_size_type.
- Computes session availability: enrollment counts + booked makeups vs capacity.
- Respects student's enrollment window (derived from active enrollments).

**Redeem credit** (`src/lib/credits/redeem-credit.ts`):
- Calls `book_makeup_with_credit` RPC.
- RPC atomically deducts credit (`apply_credits` with `FOR UPDATE`) and creates makeup booking.
- Inserts notification on success.

**Redeem UI** (`src/app/(dashboard)/parent/redeem-credit/page.tsx` or `student/redeem-credit/`):
- Month calendar with available dates highlighted.
- Shows sessions for selected date.
- Uses `CreditMakeupPicker` component.

### Files to edit
| What | File |
|------|------|
| Credit balance | `src/lib/credits/get-balance.ts` |
| Find sessions | `src/lib/credits/find-sessions-for-credit.ts` |
| Redeem logic | `src/lib/credits/redeem-credit.ts` |
| Redeem UI (parent) | `src/app/(dashboard)/parent/redeem-credit/page.tsx` |
| Redeem UI (student) | `src/app/(dashboard)/student/redeem-credit/page.tsx` |
| Credit picker component | `src/app/(dashboard)/_components/credit-makeup-picker.tsx` |
| Admin credit view | `src/app/(dashboard)/admin/credits/page.tsx` |
| RPCs | `supabase/migrations/00076_book_makeup_with_credit_rework.sql` and later |

---

## 9. Waitlist System

### High-level flow
Two separate waitlists: **enrollment waitlist** (waiting for a seat in a class) and **makeup waitlist** (waiting for a makeup slot).

### How it works

**Enrollment waitlist — LG** (`src/lib/waitlist/join.ts` → `joinWaitlist()`):
- Single-class waitlist. FIFO by `created_at`.
- When seat opens: auto-enroll immediately (`auto_enroll_from_waitlist` RPC).

**Enrollment waitlist — SG/1:1** (`src/lib/waitlist/join.ts` → `joinSgWaitlist()`):
- Student selects 2–4 preferred time slots (`preferred_class_ids` array).
- When a preferred slot gets capacity: notify student (don't auto-enroll).
- 3-day offer window. If not accepted, expire and notify next person.

**Notification flow** (`src/lib/waitlist/notify-next.ts` + `notify-sg-next.ts`):
- LG: `notifyNextOnWaitlist()` → FIFO, optimistic lock on status.
- SG: `notifySgWaitlistNext()` → checks if ≥2 preferred slots have capacity → marks notified with 3-day `offer_expires_at`.
- Sends email via `send-waitlist-notification.ts`.

**Accept offer** (`src/app/(dashboard)/enroll/waitlist-offer/[waitlistId]/`):
- Shows available slots from preferred list.
- Student picks 2 slots + subject → calls `acceptOfferAction` → `reserve_seat` RPC.

**Expiration** (`src/lib/waitlist/notify-next.ts` → `expireStaleNotifications()`):
- SG: expires after `offer_expires_at` (3 days).
- LG: expires after 24 hours from `notified_at`.
- Cascades: notifies next person in line.

**Makeup waitlist**: Separate from enrollment waitlist. See section 7.

### Files to edit
| What | File |
|------|------|
| Join waitlist | `src/lib/waitlist/join.ts` |
| Notify next (LG) | `src/lib/waitlist/notify-next.ts` |
| Notify next (SG) | `src/lib/waitlist/notify-sg-next.ts` |
| Auto-enroll | `src/lib/waitlist/auto-enroll.ts` |
| Send notification | `src/lib/waitlist/send-waitlist-notification.ts` |
| Waitlist offer UI | `src/app/(dashboard)/enroll/waitlist-offer/[waitlistId]/` |
| SG waitlist form | `src/app/(dashboard)/enroll/[classId]/sg-waitlist-form.tsx` |
| LG waitlist form | `src/app/(dashboard)/enroll/[classId]/waitlist-form.tsx` |
| Cron orchestrator | `src/app/api/cron/waitlist-notify/route.ts` |

---

## 10. Drop Class (3-Phase)

### High-level flow
Students can drop classes under different rules depending on timing relative to their start date.

### How it works

**Phase determination**: Uses `COALESCE(student_start_date, class_start_date)` as effective start.

| Phase | When | Action | Paid students |
|-------|------|--------|---------------|
| Phase 1 | >14 days before start | Self-serve drop (unpaid only) | Cannot self-drop |
| Phase 2 | ≤14 days before → 7 days after start | Note + cancel, blocks re-enroll | Cannot self-drop |
| Phase 3 | >7 days after start | Refund consultation only | Schedule consultation |

**Drop form** (`src/app/(dashboard)/parent/drop-class/drop-class-form.tsx`):
- Phase 1: drop with reason. Calls `dropEnrollment()`.
- Paid students always redirected to refund consultation.

**Note drop form** (`note-drop-form.tsx`):
- Phase 2: submit note explaining why. Creates admin log entry.

**Drop logic** (`src/lib/enrollment/drop.ts`):
- Updates enrollment status to `'canceled'`.
- Removes from Google Classroom (both slots for SG).
- Dispatches waitlist auto-enroll for freed slots.

### Files to edit
| What | File |
|------|------|
| Drop class page | `src/app/(dashboard)/parent/drop-class/page.tsx` (and student equivalent) |
| Drop form | `src/app/(dashboard)/parent/drop-class/drop-class-form.tsx` |
| Note form | `src/app/(dashboard)/parent/drop-class/note-drop-form.tsx` |
| Drop logic | `src/lib/enrollment/drop.ts` |
| Phase boundary constant | `src/lib/constants.ts` → `PHASE_1_DAYS_BEFORE_START` |

---

## 11. Google Workspace Integration

### Google Calendar
- **LG classes**: Recurring event with COUNT (fixed sessions).
- **SG/1:1 classes**: Recurring event with UNTIL date (rolling enrollment).
- **Consultations**: Single events with optional Google Meet.
- **1:1 reschedules**: New single event on picked slot.

### Google Classroom
- **LG**: One classroom per class. Created at class creation.
- **SG/1:1**: One classroom per student. Created at enrollment.
- External Gmail users: can't be added via API — get enrollment code to self-join.
- Same-domain Workspace users: added directly.

### Files to edit
| What | File |
|------|------|
| Calendar operations | `src/lib/google/calendar.ts` |
| Classroom operations | `src/lib/google/classroom.ts` |
| Sync Meet link button | `src/app/(dashboard)/admin/classes/[id]/sync-meet-link-button.tsx` |

---

## 12. Booking (Consultations)

### High-level flow
Public booking page → pick date → pick time → fill contact info → confirmed with Google Calendar event.

### How it works
- **Booking window**: Admin-configurable date range (`booking_window` table).
- **Slot generation**: 30-min slots, 9am–2pm ET, weekdays only, minus Google Calendar busy times.
- **One booking per user**: Prevents duplicate confirmed future bookings.
- **Notifications**: Email and/or SMS confirmation via Resend + Twilio.

### Files to edit
| What | File |
|------|------|
| Booking page | `src/app/book/page.tsx` |
| Booking widget | `src/app/book/booking-widget.tsx` |
| Month calendar | `src/app/book/month-calendar.tsx` |
| Available slots API | `src/app/api/bookings/available-slots/route.ts` |
| Create booking API | `src/app/api/bookings/create/route.ts` |
| Admin booking mgmt | `src/app/(dashboard)/admin/bookings/` |

---

## 13. Admin Dashboard

### Pages and their purpose

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/admin` | Overview: active enrollments, pending payments, recent signups |
| Classes | `/admin/classes` | CRUD for classes |
| Students | `/admin/students` | View all students, link parents |
| Performance | `/admin/performance` | Log session attendance + scores per class/session |
| Credits | `/admin/credits` | View issued credits |
| Makeups | `/admin/makeups` | View 1:1 reschedules, makeup bookings, pending requests |
| Refund Requests | `/admin/refund-requests` | Review and process refund requests |
| Messages | `/admin/messages` | Grouped conversations with parents/students |
| Export | `/admin/export` | CSV export: enrollments, performance, credits, students |
| Logs | `/admin/logs` | Admin audit log (last 100 entries) |
| Calendar | `/admin/calendar` | Embedded Google Calendar |
| Bookings | `/admin/bookings` | Manage consultation booking window + view bookings |

### Files to edit
All under `src/app/(dashboard)/admin/` — each page is its own directory.

---

## 14. Notifications & Messaging

### In-app notifications
- Stored in `notifications` table (user_id, message, type, read status).
- Displayed on parent/student dashboard.
- Types: enrollment, makeup, waitlist, payment, system.

### Email
- Via **Resend** (`src/lib/notifications/send-email.ts`).
- Used for: booking confirmations, waitlist offers, reminders.

### SMS
- Via **Twilio** (`src/lib/notifications/send-sms.ts`).
- Phone normalization to E.164 format.
- Used for: booking reminders (if user opted for SMS).

### Parent-tutor messaging
- `messages` table with `sender_id`, `recipient_id`, `content`.
- Parents + independent students can message tutor.
- Admin view: `/admin/messages` — grouped conversations.

### Files to edit
| What | File |
|------|------|
| Email sender | `src/lib/notifications/send-email.ts` |
| SMS sender | `src/lib/notifications/send-sms.ts` |
| Booking notification | `src/lib/notifications/send-booking-notification.ts` |
| Message form | `src/app/(dashboard)/_components/message-form.tsx` |
| Admin messages | `src/app/(dashboard)/admin/messages/page.tsx` |

---

## 15. Cron Jobs

All cron routes require `CRON_SECRET` header validation.

| Cron | Route | Schedule | Purpose |
|------|-------|----------|---------|
| Cancel credits | `/api/cron/cancel-credits` | Daily | Expire LG cancellations (7d), mark makeup no-shows, restore credits for missed credit-based bookings, auto-book waitlist |
| Waitlist notify | `/api/cron/waitlist-notify` | Frequent | Expire stale notifications, process notify queue, sweep remaining waiting entries |
| Auto-unenroll | `/api/cron/auto-unenroll` | Daily | Cancel active+unpaid enrollments past payment deadline |
| Booking reminders | `/api/cron/booking-reminders` | Hourly | Send reminders for bookings 11-12 hours away |
| Reports | `/api/cron/reports` | — | Stub (not yet implemented) |

### Files to edit
All under `src/app/api/cron/` — each cron is its own directory with `route.ts`.
Cron schedule configured in `vercel.json`.

---

## 16. Database Schema Summary

### Core tables
| Table | Purpose |
|-------|---------|
| `users` | Auth profiles (full_name, phone, role, email) |
| `students` | Student records (grade, parent_id, user_id, email) |
| `classes` | Time slots (meeting_day, meeting_time, group_size_type, capacity, subject/level for LG only) |
| `enrollments` | Student ↔ class link (slot_1/2/3_class_id, subject_category, subject_detail, status, payment_status) |
| `session_cancellations` | Cancelled sessions (enrollment_id, class_id, session_number, session_date, status) |
| `makeup_bookings` | Booked makeups (cancellation_id or credit_id, host_class_id, session_date, status) |
| `credits` | Makeup credits (student_id, group_size_type, amount, remaining_amount, expires_at) |
| `waitlist` | Enrollment waitlist (student_id, class_id or preferred_class_ids, status, offer_expires_at) |
| `makeup_waitlist` | Makeup session waitlist (cancellation_id, host_class_id, session_date, status) |

### Supporting tables
| Table | Purpose |
|-------|---------|
| `performance_logs` | Session attendance + scores (student_id, class_id, session_number) |
| `notifications` | In-app notifications |
| `messages` | Parent-tutor messages |
| `admin_logs` | Audit log (admin_id, action, metadata) |
| `bookings` | Consultation bookings |
| `booking_window` | Admin-configurable booking availability |
| `office_hours` | Display-only office hours |
| `refund_requests` | Refund request workflow |
| `waitlist_notify_queue` | Queue for triggering waitlist cascades |

### Key RPCs
| RPC | Migration | Purpose |
|-----|-----------|---------|
| `reserve_seat` | 00083 | Atomic seat reservation with capacity check |
| `apply_credits` | 00051+ | FIFO credit deduction with row lock |
| `book_makeup_session` | 00088 | Book makeup with validation |
| `book_makeup_with_credit` | 00076+ | Redeem credit for makeup |
| `cancel_makeup_booking` | 00088 | Cancel makeup + status revert |
| `join_makeup_waitlist` | 00088 | Join makeup waitlist |
| `auto_book_makeup_from_waitlist` | 00088 | FIFO auto-book from makeup waitlist |
| `auto_enroll_from_waitlist` | — | Auto-enroll from enrollment waitlist (LG) |
| `auto_enroll_sg_from_waitlist` | — | Auto-enroll from SG waitlist |
| `mark_student_absent` | 00052 | Record unexcused absence |
| `cancel_session` | 00080+ | Cancel a session |

---

> See `ARCHITECTURE.md` for the component-level file map.
