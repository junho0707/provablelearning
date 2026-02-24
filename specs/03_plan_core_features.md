# Core Features Plan

## Current State
- Enrollment flow, Stripe payments, credits, waitlist, RLS, admin dashboards: **DONE**
- Google Calendar, Slack, SMS/text, public page content: **NOT STARTED**
- Google Meet links: manual column in `cohorts` table, no auto-scheduling

---

## 1. Public Page (no login required)

### 1A. Teaching Philosophy & Credentials
- Rewrite `src/app/page.tsx` as a proper landing page
- Sections: hero, philosophy, credentials/bio, testimonials placeholder, CTA
- Responsive, clean Tailwind design
- No new dependencies

### 1B. View Offerings
- Public route `/offerings` (or section on landing page)
- Query published modules + cohorts (public RLS policy needed)
- Show: subject, schedule, group size, price, seats remaining
- No login required to browse

### 1C. Book a Meeting with Tutor
**Integration chain: Google Calendar + Slack + Twilio SMS**

- **Page**: `/book` — Calendly-style UX
  - Fetch tutor's real-time Google Calendar free/busy
  - Show available time slots, parent picks one
  - Parent provides: name, phone, email
- **Google Calendar API**: create event on tutor's calendar with parent as attendee
  - Dep: `googleapis` package, service account with domain-wide delegation (or OAuth)
  - Store calendar ID in env vars
- **Slack notification**: post to channel when booking is made
  - Dep: Slack incoming webhook (simplest) or `@slack/web-api`
  - Webhook URL in env vars
- **Twilio SMS to parent**:
  - Confirmation text immediately after booking
  - Reminder text 24hr before meeting (Twilio scheduled message API)
  - Dep: `twilio` package
  - Account SID, auth token, phone number in env vars
- **DB**: `bookings` table (parent_name, phone, email, datetime, duration_min, status, google_event_id)
- **Migration**: new table + RLS (public insert, admin read/update)

---

## 2. Parent Dashboard (logged in)

### 2A. Enroll Student
**Already built.** Flow: browse `/enroll` -> pick cohort -> reserve seat -> Stripe checkout -> webhook activates.

**Missing external integrations after enrollment:**
- **Google Calendar invite**: send recurring calendar events for class schedule to parent's email
  - Use Calendar API `events.insert` with `attendees`
- **Google Classroom invite**: add student to Classroom
  - Dep: `googleapis` Classroom API, teacher account OAuth
  - Store classroom IDs on cohorts table (new column `google_classroom_id`)
- **Trigger point**: in Stripe webhook handler after enrollment activated

### 2B. Cancel Attendance & Makeup Policy ✅ COMPLETE

**Cancellation rule**: Must cancel **24+ hours** before class (small groups). Other sizes: before session date.

**Policy by group size:**

| Group Type | Makeup Path | If Not Made Up By End of Week (Sunday) |
|------------|-------------|----------------------------------------|
| **1:1** | Reschedule via Google Calendar | Non-expiring credit auto-issued |
| **Small group** | Join alternate session same week | Credit auto-issued |
| **Medium group** | Join alternate session same week | Credit auto-issued |
| **Large group** | Join alternate session same week | **No credit** |

**Implementation (actual):**
- **Pages**: `/parent/cancel-session` + `/student/cancel-session`
- **Validation**: 24hr notice for small groups, future date required
- **Creates**: `session_cancellations` record with `credit_deadline` = end-of-week Sunday 11:59:59 PM ET
- **Alternate sessions**: `book_makeup_session` RPC — same course, same group size, same week, capacity-checked
- **Auto-credit cron**: `/api/cron/cancel-credits` checks `credit_deadline`:
  - Small/medium/1:1 past deadline → auto-issue credit, set status `credit_issued`
  - Large → expires after 7 days with no credit
- **No-show handling**: Makeup no-shows revert cancellation to `cancelled` so credit deadline can fire
- **On cancel**: Google Calendar cleanup (TODO — Phase 4 remaining)

**DB:**
- `session_cancellations` table (migration 00031 + 00032 rename)
- `makeup_bookings` table (migration 00033)
- Credit deadline updated in migration 00034

### 2C. Join Tutor Office Hours
- Store office hours link (Google Meet) + schedule in DB
- Show on parent dashboard — "Join Office Hours" button, schedule-aware (only active during window)
- **DB**: `office_hours` table (meet_link, day_of_week, start_time, end_time)

### 2D. View Student Progress
**Already built.** Parent dashboard shows performance_logs for their children.

### 2E. Refunds ✅ COMPLETE
**Admin-initiated refunds** at `/admin/refunds` (Stripe refund or credit issuance).

**Parent-facing**: `/parent/refund` shows explanation + "Schedule a Consultation" link to `/book`.
Refunds are case-by-case — parent books a meeting, admin processes after discussion.
- `refund_requests` table exists for historical data but no new entries are created via form.
- `/admin/refund-requests/` kept for admin visibility of any past requests.

---

## 3. Student Dashboard (logged in)

### 3A. Dashboard: Notifications & Upcoming Classes
- Show upcoming classes (from cohort schedule)
- Show unread notifications (enrollment events, makeup approvals, admin messages)
- **DB**: `notifications` table (user_id, message, type, read, created_at)

### 3B. Relevant Links
- Google Classroom link (from cohort)
- Google Meet link (from cohort — already stored)
- Office hours link
- Shared Drive folders / resources

### 3C. Leave Message to Tutor
- Simple message form on student dashboard
- **DB**: `messages` table (from_user_id, to_user_id, body, read, created_at)
- Tutor sees messages in admin dashboard (new section)
- Slack notification to tutor when student sends message

---

## Implementation Order

### Phase 1 — No new external deps, highest impact
1. Public landing page rewrite (1A)
2. Public offerings page (1B) + public RLS policy
3. Student notifications + upcoming classes (3A) + `notifications` table
4. Student messaging (3C) + `messages` table
5. Student relevant links display (3B)
6. Office hours display (2C) + `office_hours` table
7. Parent refund page → consultation link to `/book` (2E)

### Phase 2 — Google APIs
8. `googleapis` setup (service account, credentials, env vars)
9. Post-enrollment: Google Calendar invite to parent (2A)
10. Post-enrollment: Google Classroom invite (2A)
11. Booking page — Calendly-style with free/busy (1C calendar part)

### Phase 3 — Slack + Twilio
12. Slack incoming webhook setup
13. Booking → Slack notification (1C)
14. Twilio setup (account, phone number, env vars)
15. Booking → confirmation SMS + 24hr reminder (1C)
16. Student message → Slack notification to tutor (3C)

### Phase 4 — Cancellation & Makeup Policy Engine ✅ MOSTLY COMPLETE
17. ✅ `session_cancellations` table + migration (00031 + 00032 rename)
18. ✅ Cancel attendance pages `/parent/cancel-session` + `/student/cancel-session` (2B)
19. ✅ Makeup policy logic — end-of-week Sunday deadline (migration 00034)
20. ✅ Credit auto-issuance via `/api/cron/cancel-credits` + no-show revert
21. ✅ Alternate makeup session booking (`makeup_bookings` table, migration 00033)
22. ⏳ Google Calendar cleanup on cancel

---

## New Dependencies
| Package | Purpose | Phase |
|---------|---------|-------|
| `googleapis` | Calendar, Classroom, Drive APIs | 2 |
| `@slack/web-api` or incoming webhook | Slack notifications | 3 |
| `twilio` | SMS confirmation & reminders | 3 |

## New DB Tables
| Table | Purpose | Phase |
|-------|---------|-------|
| `notifications` | In-app notifications for students/parents | 1 |
| `messages` | Student-tutor messaging | 1 |
| `office_hours` | Tutor availability + meet link | 1 |
| `refund_requests` | Parent-initiated refund requests | 1 |
| `bookings` | Parent meeting bookings (pre-enrollment) | 2 |
| `session_cancellations` | Attendance cancellations + credit deadline tracking | 4 |

## New Columns
| Table | Column | Purpose | Phase |
|-------|--------|---------|-------|
| `cohorts` | `google_classroom_id` | Link to Google Classroom | 2 |
| `credits` | `expires_at` | Class credit expiry (module end date) | 4 |
| `credits` | `source_cancellation_id` | Link credit to cancellation | 4 |
