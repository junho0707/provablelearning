# Level 1 — System Context

The highest-level view: ProvableLearning as a single system, the people who use it, and the external services it depends on.

```mermaid
flowchart TB
    subgraph actors [" "]
        direction LR
        student("👤 <b>Student</b><br/>Takes classes, manages<br/>schedule and makeups")
        parent("👤 <b>Parent</b><br/>Enrolls children, manages<br/>payments, messages tutor")
        admin("👤 <b>Admin / Tutor</b><br/>Creates classes, tracks<br/>performance, manages credits")
    end

    pl[/"🎓 <b>ProvableLearning</b><br/>SAT tutoring platform: enrollment,<br/>scheduling, payments, performance"/]

    subgraph services ["External Services"]
        direction LR
        supabase[("<b>Supabase</b><br/>PostgreSQL + Auth + RLS")]
        stripe[("<b>Stripe</b><br/>Payment processing")]
        google[("<b>Google Workspace</b><br/>Calendar, Classroom, Drive")]
        resend[("<b>Resend</b><br/>Email delivery")]
        twilio[("<b>Twilio</b><br/>SMS delivery")]
        vercel[("<b>Vercel</b><br/>Hosting + Cron")]
    end

    student -- "Enroll, cancel,<br/>book makeups" --> pl
    parent -- "Enroll children,<br/>pay, message tutor" --> pl
    admin -- "Manage classes,<br/>credits, refunds" --> pl

    pl -- "Data + Auth" --> supabase
    pl -- "Checkout +<br/>Webhooks" --> stripe
    pl -- "Calendar +<br/>Classroom" --> google
    pl -- "Emails" --> resend
    pl -- "SMS" --> twilio
    pl -. "Deployed on" .-> vercel

    style actors fill:none,stroke:none
    style pl fill:#1168bd,stroke:#0b4884,color:#fff
    style supabase fill:#999,stroke:#666,color:#fff
    style stripe fill:#999,stroke:#666,color:#fff
    style google fill:#999,stroke:#666,color:#fff
    style resend fill:#999,stroke:#666,color:#fff
    style twilio fill:#999,stroke:#666,color:#fff
    style vercel fill:#999,stroke:#666,color:#fff
    style student fill:#08427b,stroke:#052e56,color:#fff
    style parent fill:#08427b,stroke:#052e56,color:#fff
    style admin fill:#08427b,stroke:#052e56,color:#fff
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
