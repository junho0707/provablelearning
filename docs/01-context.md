# L1 — Context

What ProvableLearning is, who uses it, what it depends on, and the journey catalog.

## What it is

A SAT-tutoring platform that runs **rolling per-student enrollments** in three group sizes (1:1, Small Group, Large Group), takes payment, schedules sessions, manages cancellations / makeups / credits, and gives parents and students a unified dashboard. Admins (the tutor) run the operation through the same app.

Architecturally: a single Next.js 15 App Router app deployed on Vercel, backed by Supabase Postgres + Auth + RLS, and integrated with Stripe (payments), Google Workspace (Calendar + Classroom), and Resend / Twilio (email + SMS).

## Actors

Four actors, all of which can drive journeys against the system. Three are end-user roles in `users.role`; the fourth is the public-internet visitor that uses unauthenticated routes.

| Actor | Auth | Distinguishing trait | Lives in |
|---|---|---|---|
| **Visitor** | none | Unauthenticated; can browse marketing pages, view offerings, book a free consultation | `/`, `/offerings`, `/book` |
| **Parent** | `users.role = 'parent'` | Owns one or more `students` rows where `parent_id = self`. Pays. Can act on behalf of any of their dependents. | `/parent/*` |
| **Student (dependent)** | `users.role = 'student'` AND `students.parent_id IS NOT NULL` | A child of a Parent; cannot pay or change family settings, but can use the dashboard | `/student/*` |
| **Student (independent)** | `users.role = 'student'` AND `students.parent_id IS NULL` | An adult enrollee with no parent; behaves like a Parent + Student combined | `/student/*` |
| **Admin** | `users.role = 'admin'` | Seed-only; full operational control | `/admin/*` |

> **Why the Parent / dependent-Student split matters:** the Parent is a separate principal — payment authorization and family management belong to her, not to the child. Treat them as distinct actors throughout the journey docs.

## External services (system boundary)

```
                    ┌──────────────────────────┐
                    │   ProvableLearning App   │
                    │   (Next.js on Vercel)    │
                    └────────────┬─────────────┘
                                 │
       ┌──────────────┬──────────┼──────────────┬─────────────┐
       │              │          │              │             │
       ▼              ▼          ▼              ▼             ▼
  ┌─────────┐   ┌──────────┐ ┌────────┐  ┌─────────────┐  ┌────────┐
  │ Stripe  │   │ Supabase │ │ Google │  │ Resend      │  │ Twilio │
  │ Checkout│   │ Postgres │ │ Workspc│  │ (email)     │  │ (SMS)  │
  │  +Refund│   │ +Auth +  │ │  Cal + │  │             │  │        │
  │  +Webhk │   │  RLS+RPC │ │ Clssrm │  │             │  │        │
  └─────────┘   └──────────┘ └────────┘  └─────────────┘  └────────┘
```

| Service | What we use it for | Where it's wired |
|---|---|---|
| **Vercel** | Hosting, cron scheduler (`vercel.json`), env management | Deployment + crons |
| **Supabase** | Postgres database, Auth (email + password, Google OAuth), RLS policies, RPCs (`SECURITY DEFINER`) | `src/lib/supabase/`, `supabase/migrations/` |
| **Stripe** | Checkout sessions for enrollment payment, refunds, webhook events | `src/lib/stripe/`, `src/app/api/webhooks/stripe/` |
| **Google Workspace** | Calendar events for sessions and consultations; Classroom for course materials and roster | `src/lib/google/` |
| **Resend** | Transactional email (waitlist offers, booking confirmations + reminders, notifications) | `src/lib/notifications/send-email.ts` |
| **Twilio** | SMS booking confirmations + reminders | `src/lib/notifications/send-sms.ts` |

> **Note on the "knowledge update" injected into the harness:** the in-context Vercel session-reminder describes Vercel's current platform conventions. This project is on the older `vercel.json`-based config, runs Node functions, and uses Vercel for cron scheduling — that's what's documented here. Migration to `vercel.ts` / Fluid Compute is not in scope for the current docs.

## Journey catalog

Eleven user-intent arcs. Each has its own L2 file. End-user journeys are non-admin; admin operations are grouped under `journeys/admin/`.

| Journey | Primary actor | One-liner | File |
|---|---|---|---|
| Discover & sign up | Visitor → Parent / independent Student | Land on the marketing site, optionally book a consult, sign up, finish onboarding (role + phone), get routed to the right dashboard. | [journeys/discover-and-signup.md](journeys/discover-and-signup.md) |
| Family management | Parent | Add a child, reset a child's password, remove a child. | [journeys/family-management.md](journeys/family-management.md) |
| View my data | Parent / Student | Read the dashboard: enrollments, upcoming sessions, cancellations, makeups, performance logs, credits, payment status, notifications. | [journeys/view-my-data.md](journeys/view-my-data.md) |
| Messaging | Parent / independent Student / Admin | Send and read messages between a tutoring family and the admin. | [journeys/messaging.md](journeys/messaging.md) |
| Enroll | Parent / independent Student | Browse classes, pick slots, accept the agreement, pay (or pay later), join the waitlist if full, accept a waitlist offer. **LG / SG / 1:1 are scenario variants in this file.** | [journeys/enroll.md](journeys/enroll.md) |
| Manage attendance | Parent / Student | Cancel a session, find an alternate / book a makeup / join the makeup waitlist, cancel a makeup, redeem a credit, submit an excuse note. | [journeys/manage-attendance.md](journeys/manage-attendance.md) |
| End enrollment | Parent / independent Student | Drop the class (Phase 1 self-serve), or request a refund consultation (Phase 2 / 3). | [journeys/end-enrollment.md](journeys/end-enrollment.md) |
| Book ad-hoc | Visitor / Parent | Book a free consultation through `/book`; drop into office hours. | [journeys/book-ad-hoc.md](journeys/book-ad-hoc.md) |
| Run classes | Admin | CRUD classes, create Google Classroom + Calendar artifacts, manage class capacity. | [journeys/admin/run-classes.md](journeys/admin/run-classes.md) |
| Handle students | Admin | Log performance, approve / deny refund requests, issue credits, review cancellations + makeups + bookings. | [journeys/admin/handle-students.md](journeys/admin/handle-students.md) |
| Operate | Admin | Read audit logs, export data, see calendar, monitor crons. | [journeys/admin/operate.md](journeys/admin/operate.md) |

## Glossary (load-bearing terms)

- **Class** — a recurring time slot. SG and 1:1 classes are subject-agnostic; LG carries `subject` + `level`.
- **Enrollment** — a student's commitment to one (LG) or two (SG / 1:1) or three (rare 3x/wk SG) class slots. Carries the agreement, payment status, and date window.
- **Slot** — a single class assignment within an enrollment. `slot_1_class_id` is canonical; `slot_2_class_id` and `slot_3_class_id` are optional.
- **Subject category** — `dsat_rw`, `dsat_math`, `dsat_rw_math`, `general_math`. Stored on the enrollment for SG / 1:1; on the class for LG.
- **Phase 1 / 2 / 3 drop** — drop-class status windows: > 7 days before start (self-serve unpaid), ≤ 7 days before through 7 days after start (admin + `class_blocked`), > 7 days after start (refund consultation only).
- **Pay-later** — `reserve_seat(p_pay_later=true)` creates an `active+unpaid` enrollment with a 7-day payment deadline.
- **Makeup** — a student attends a session in a different class as a replacement for a cancelled session. Tracked in `makeup_bookings`.
- **Credit** — admin-issued unit (1 makeup) for a specific `group_size_type`. Spendable only on makeups.
- **Office hours** — drop-in Google Meet windows defined in `office_hours`.
