# Level 1 — System Context

The highest-level view: ProvableLearning as a single system, the people who use it, and the external services it depends on.

```mermaid
C4Context
    title ProvableLearning — System Context

    Person(student, "Student", "Takes SAT prep or math classes, manages schedule and makeups")
    Person(parent, "Parent", "Enrolls children, manages payments, communicates with tutor")
    Person(admin, "Admin / Tutor", "Creates classes, tracks performance, manages enrollments and credits")

    System(pl, "ProvableLearning", "SAT tutoring platform: class enrollment, scheduling, payments, and performance tracking")

    System_Ext(supabase, "Supabase", "PostgreSQL database, authentication, row-level security")
    System_Ext(stripe, "Stripe", "Payment processing: checkout sessions, webhooks")
    System_Ext(google, "Google Workspace", "Calendar events, Classroom spaces, Drive folders")
    System_Ext(resend, "Resend", "Transactional email delivery")
    System_Ext(twilio, "Twilio", "SMS notifications")
    System_Ext(vercel, "Vercel", "Hosting, serverless functions, cron scheduling")

    Rel(student, pl, "Browses classes, enrolls, cancels sessions, books makeups, redeems credits")
    Rel(parent, pl, "Enrolls children, pays, cancels sessions, messages tutor")
    Rel(admin, pl, "Creates classes, logs performance, manages credits and refunds")

    Rel(pl, supabase, "Reads/writes all data, authenticates users")
    Rel(pl, stripe, "Creates checkout sessions, receives payment webhooks")
    Rel(pl, google, "Creates calendar events, classroom spaces, drive folders")
    Rel(pl, resend, "Sends enrollment confirmations, waitlist notifications, reminders")
    Rel(pl, twilio, "Sends SMS booking reminders and waitlist alerts")

    UpdateRelStyle(student, pl, $offsetY="-30")
    UpdateRelStyle(parent, pl, $offsetY="-30")
    UpdateRelStyle(admin, pl, $offsetY="-30")
```

## Actors

| Actor | Role | Key actions |
|-------|------|-------------|
| **Student** | End user (may be independent or a parent's child) | Browse/enroll in classes, cancel sessions, book makeups, redeem credits, view performance |
| **Parent** | Guardian of one or more students | Enroll children, make payments, cancel sessions on behalf of children, message tutor |
| **Admin / Tutor** | Platform operator (seed-only, no self-registration) | Create/manage classes, log performance scores, issue credits, process refunds, view logs |

## External Systems

| System | Purpose | Integration method |
|--------|---------|-------------------|
| **Supabase** | PostgreSQL database + Auth (email/password + Google OAuth) | `@supabase/ssr` server client, `@supabase/supabase-js` browser client, admin client with service role key |
| **Stripe** | Payment processing | Stripe SDK — create checkout sessions; receive `checkout.session.completed` and `async_payment_*` webhooks |
| **Google Workspace** | Calendar (class schedules), Classroom (course materials), Drive (folder organization) | `googleapis` SDK with service account credentials |
| **Resend** | Email delivery | REST API via `resend` SDK — enrollment confirmations, waitlist notifications, reminders |
| **Twilio** | SMS delivery | REST API via `twilio` SDK — booking reminders, waitlist alerts |
| **Vercel** | Hosting + cron | Next.js deployment with 7 cron jobs (reconcile, waitlist-notify, backup, reports, cancel-credits, booking-reminders, auto-unenroll) |
