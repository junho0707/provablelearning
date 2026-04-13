# Level 3 — Component

Zooms into the Next.js application to show the library modules, their responsibilities, and how they interact.

```mermaid
C4Component
    title ProvableLearning — Component Diagram (Next.js App)

    Container_Boundary(pages, "Pages (src/app)") {
        Component(auth_pages, "Auth Pages", "(auth)/", "Login, signup, onboarding, password reset, OAuth callback")
        Component(student_pages, "Student Dashboard", "(dashboard)/student/", "Dashboard, payments, cancel session, drop class, makeup, redeem credit")
        Component(parent_pages, "Parent Dashboard", "(dashboard)/parent/", "Dashboard, add student, payments, cancel session, drop class, redeem credit")
        Component(admin_pages, "Admin Dashboard", "(dashboard)/admin/", "Classes, students, performance, credits, makeups, refunds, messages, calendar, logs, export")
        Component(enroll_pages, "Enrollment Flow", "enroll/", "Browse classes, select slots, Stripe checkout, waitlist offers")
        Component(public_pages, "Public Pages", "/", "Landing, offerings, booking widget")
    }

    Container_Boundary(lib, "Core Libraries (src/lib)") {
        Component(enrollment_lib, "Enrollment", "src/lib/enrollment/", "check-eligibility, reserve (calls reserve_seat RPC), drop (3-phase), pay-now")
        Component(cancellation_lib, "Cancellation", "src/lib/cancellation/", "cancel-session, book-makeup, auto-book-makeup, find-alternate-sessions, join-makeup-waitlist")
        Component(credits_lib, "Credits", "src/lib/credits/", "get-balance, apply-credits (calls apply_credits RPC), find-sessions-for-credit, redeem-credit")
        Component(waitlist_lib, "Waitlist", "src/lib/waitlist/", "join, notify-next, auto-enroll, send-waitlist-notification")
        Component(scheduling_lib, "Scheduling", "src/lib/scheduling/", "computeSessionDates, computeEnrollmentSessions — session date math from slots + start date")
        Component(stripe_lib, "Stripe", "src/lib/stripe/", "client, prices, create-checkout, webhook-handlers")
        Component(google_lib, "Google", "src/lib/google/", "auth (service account), calendar, classroom, drive-folders")
        Component(notifications_lib, "Notifications", "src/lib/notifications/", "send-email (Resend), send-sms (Twilio), send-booking-notification")
        Component(auth_lib, "Auth", "src/lib/auth/", "get-user-role, google-oauth, get-nav-props, verify-cron-secret")
        Component(supabase_lib, "Supabase Clients", "src/lib/supabase/", "client.ts (browser), server.ts (server+RLS), admin.ts (service role)")
        Component(validators_lib, "Validators", "src/lib/validators/", "Zod schemas for class creation and other inputs")
    }

    Component(middleware, "Middleware", "src/middleware.ts", "Auth enforcement, role-based routing, session refresh")
    Component(types, "Types & Constants", "src/lib/types.ts, constants.ts", "TypeScript interfaces, enums, pricing, config")

    Rel(auth_pages, auth_lib, "Sign in/up, OAuth")
    Rel(auth_pages, supabase_lib, "Auth client")
    Rel(student_pages, enrollment_lib, "View enrollments")
    Rel(student_pages, cancellation_lib, "Cancel sessions, book makeups")
    Rel(student_pages, credits_lib, "View balance, redeem")
    Rel(parent_pages, enrollment_lib, "Enroll children, view enrollments")
    Rel(parent_pages, cancellation_lib, "Cancel on behalf of children")
    Rel(parent_pages, credits_lib, "View balance, redeem for children")
    Rel(admin_pages, supabase_lib, "Direct DB queries for management")
    Rel(enroll_pages, enrollment_lib, "Check eligibility, reserve seat")
    Rel(enroll_pages, stripe_lib, "Create checkout session")
    Rel(enroll_pages, scheduling_lib, "Compute session dates for preview")
    Rel(enroll_pages, waitlist_lib, "Join waitlist if full")

    Rel(enrollment_lib, supabase_lib, "reserve_seat RPC, enrollment CRUD")
    Rel(enrollment_lib, scheduling_lib, "Compute session dates")
    Rel(cancellation_lib, supabase_lib, "Cancellation + makeup records")
    Rel(cancellation_lib, credits_lib, "Apply credits for makeups")
    Rel(credits_lib, supabase_lib, "apply_credits RPC")
    Rel(waitlist_lib, supabase_lib, "Waitlist CRUD")
    Rel(waitlist_lib, notifications_lib, "Notify next in queue")
    Rel(stripe_lib, supabase_lib, "Update payment status via webhook")
    Rel(google_lib, supabase_lib, "Store Google IDs on classes/enrollments")
    Rel(notifications_lib, supabase_lib, "Log notifications")
    Rel(middleware, auth_lib, "Role resolution")
    Rel(middleware, supabase_lib, "Session refresh")
```

## Module Details

### Enrollment (`src/lib/enrollment/`)

The core business flow. Handles the full lifecycle from eligibility check to active enrollment.

| File | Responsibility |
|------|---------------|
| `check-eligibility.ts` | Validates student can enroll: capacity, duplicate check, re-enrollment limits, enrollment window |
| `reserve.ts` | Calls `reserve_seat` Postgres RPC — atomically locks both slots with `FOR UPDATE`, inserts enrollment |
| `drop.ts` | 3-phase drop logic: Phase 1 (>14d before start) = self-serve; Phase 2 (<=14d to 7d after) = note + cancel; Phase 3 = refund consultation |
| `pay-now.ts` | Creates Stripe checkout session for unpaid enrollments |

### Cancellation (`src/lib/cancellation/`)

Handles session cancellations and the makeup booking flow.

| File | Responsibility |
|------|---------------|
| `cancel-session.ts` | Records cancellation, issues credit if tutor-initiated |
| `book-makeup.ts` | Books a makeup session using a credit |
| `auto-book-makeup.ts` | Automatically books into the next available compatible slot |
| `find-alternate-sessions.ts` | Finds open slots compatible with the student's enrollment for makeup |
| `join-makeup-waitlist.ts` | Joins the FIFO makeup waitlist for a full slot |

### Credits (`src/lib/credits/`)

Credits are earned from tutor-canceled sessions and redeemed for makeups.

| File | Responsibility |
|------|---------------|
| `get-balance.ts` | Returns available credit count for a student |
| `apply-credits.ts` | Calls `apply_credits` Postgres RPC — FIFO deduction with `FOR UPDATE` row locks |
| `find-sessions-for-credit.ts` | Lists eligible sessions where a credit can be used |
| `redeem-credit.ts` | End-to-end credit redemption: find slot → apply credit → book makeup |

### Waitlist (`src/lib/waitlist/`)

Two waitlist types: enrollment waitlist (class full) and makeup waitlist (makeup slot full).

| File | Responsibility |
|------|---------------|
| `join.ts` | Add student to FIFO enrollment waitlist |
| `notify-next.ts` | Pop next from queue, send notification (24h claim window) |
| `auto-enroll.ts` | When spot opens, automatically enroll the next waitlisted student |
| `send-waitlist-notification.ts` | Sends email + SMS notification for waitlist offers |

### Scheduling (`src/lib/scheduling/`)

Pure computation — no side effects.

| File | Responsibility |
|------|---------------|
| `session-dates.ts` | `computeSessionDates()` — given a slot's day/time and a start date, returns all session dates. `computeEnrollmentSessions()` — maps dual-slot enrollment to session list (odd weeks → slot 1, even → slot 2) |

### Stripe (`src/lib/stripe/`)

| File | Responsibility |
|------|---------------|
| `client.ts` | Stripe SDK initialization |
| `prices.ts` | Price lookup by group size type |
| `create-checkout.ts` | Creates Stripe Checkout session with metadata for webhook |
| `webhook-handlers.ts` | Processes `checkout.session.completed`, `async_payment_succeeded/failed` — activates enrollment, updates payment status |

### Google (`src/lib/google/`)

| File | Responsibility |
|------|---------------|
| `auth.ts` | Google service account authentication |
| `calendar.ts` | Create/update Google Calendar events for class sessions |
| `classroom.ts` | Create Google Classroom spaces (LG: per class, SG/1:1: per student) |
| `drive-folders.ts` | Organize Google Drive folders for class materials |

### Notifications (`src/lib/notifications/`)

| File | Responsibility |
|------|---------------|
| `send-email.ts` | Sends via Resend API — enrollment confirmations, waitlist notifications, reminders |
| `send-sms.ts` | Sends via Twilio API — booking reminders, waitlist alerts |
| `send-booking-notification.ts` | Combined email + SMS for booking confirmations |

### Auth (`src/lib/auth/`)

| File | Responsibility |
|------|---------------|
| `get-user-role.ts` | Resolves current user's role from Supabase session |
| `google-oauth.ts` | Google OAuth sign-in with PKCE, automatic identity linking |
| `get-nav-props.ts` | Returns navigation data based on role |
| `verify-cron-secret.ts` | Validates `CRON_SECRET` header for cron job authentication |

### Supabase Clients (`src/lib/supabase/`)

| File | Responsibility |
|------|---------------|
| `client.ts` | Browser client (anon key, respects RLS) |
| `server.ts` | Server client (anon key + cookies, respects RLS) |
| `admin.ts` | Admin client (service role key, bypasses RLS — used by cron jobs and webhooks) |

### Key Postgres RPCs

| RPC | Purpose |
|-----|---------|
| `reserve_seat` | Atomic dual-slot seat reservation with `FOR UPDATE` row locks. Accepts `p_pay_later` flag for deferred payment |
| `release_seat` | Releases reserved seats, decrements enrollment count |
| `apply_credits` | FIFO credit deduction with row-level locking — ensures no double-spend |
| `admin_set_role_parent` | Elevates a user's role to parent (admin-only) |
