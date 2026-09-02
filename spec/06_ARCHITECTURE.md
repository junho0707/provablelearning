# 06 — Architecture

Status: **REWRITTEN 2026-08-14** against `14_GROUND_TRUTH_INTERVIEW.md` + ADR-003/004/005. Endpoint
detail lives in `08_API_CONTRACTS.md`; schema detail in `07_DATA_MODEL.md`. Decisions of record:
ADR-001 (content model); the codebase approach (fresh app, port v1 modules), stack, and repo shape
are recorded in §9 below.

## System context

```
        Google Search / direct
                 │
                 ▼
   ┌──────────────────────────────┐        ┌─────────────┐
   │  Next.js App (App Router)     │◄──────►│  Supabase   │  Postgres + Auth + RLS + RPC
   │  · SSR/SSG content pages      │        └─────────────┘  (system of record)
   │  · RSC + route handlers       │        ┌─────────────┐
   │  · admin/authoring UI         │◄──────►│  Stripe     │  one-time Checkout + webhook
   │  · cron endpoints             │        └─────────────┘
   └──────────────────────────────┘        ┌─────────────┐
        │            ▲     │                │  Google     │  OAuth + Calendar/Meet
   content/*.mdx     │     └───────────────►└─────────────┘
   (in-repo)         │                      ┌─────────────┐
                     └─────────────────────►│  Email      │  transactional (confirm, remind, receipt)
                                            └─────────────┘
```

Actors (`04_ACTORS.md`) reach the system only through the Next.js app. Content prose is read from
in-repo MDX at build/render time; all dynamic state is in Supabase.

## Boundaries & trust

- **Client (untrusted).** Browser / RSC client. Never writes money or booking state directly.
- **Next.js server (trusted app tier).** Server Components + route handlers run server-side with
  the user's session; enforce input validation (Zod) and orchestrate calls to Supabase.
- **Supabase (data tier).** **RLS is the primary authorization boundary** (NFR-SEC-001):
  own-data isolation (`accounts` → `learner_profiles`, no consent gate — learner profiles hold no
  credentials, INV-ACTOR-1), world-readable content, admin-all. Correctness-critical writes go only
  through **`SECURITY DEFINER` RPCs with `FOR UPDATE`** (NFR-SEC-002) — never unguarded client
  writes.
- **Stripe → webhook (server-to-server).** The signature-verified webhook is the *only* trusted
  trigger that credits the ledger (NFR-SEC-004, NFR-REL-001). The browser redirect after checkout
  is not trusted to grant credits.
- **Google / Email (side-effect integrations).** Calendar/Meet and email are best-effort side
  effects; their failure must not lose a booking or a purchase (see failure boundaries).

## Modules (dependency direction: UI → application → data; nothing lower depends on higher)

| Module | Responsibility | Key requirements |
|---|---|---|
| `content` | Read MDX, build catalog + Learning Path, render lessons (SSR/SSG) | REQ-CONTENT-*, NFR-PERF-* |
| `practice` | Serve questions, check answers (mcq/numeric), free-response reveal | REQ-PRACTICE-* |
| `progress` | Record attempts + lesson progress (logged-in) | REQ-PROGRESS-* |
| `accounts` | Google OAuth + magic link; learner-profile CRUD and switching (no consent gate — no credentials) | REQ-AUTH-*, REQ-ACCT-* |
| `credits` | Credit ledger; atomic spend RPC | REQ-CREDIT-* |
| `billing` | Stripe checkout (credit packs + First Session); idempotent webhook → purchase entry | REQ-BILLING-*, NFR-REL-001 |
| `booking` | Availability; atomic reserve-slot-and-spend RPC; Calendar/Meet | REQ-BOOK-*, NFR-REL-002 |
| `notifications` | Transactional email (confirmation, reminders, receipt) | REQ-NOTIFY-* |
| `admin` | Authoring, availability, refunds, calendar, users, audit log | REQ-CONTENT-*, REQ-BILLING-005, NFR-OPS-002 |
| `cron` | Scheduled reminders (24h/1h), housekeeping | REQ-NOTIFY-001 |

`credits` and `booking` share the atomic-RPC discipline ported from v1 (`apply_credits`,
`reserve_seat`). `booking` depends on `credits` (spend happens inside the reservation tx).

## Request & data flow (critical paths)

- **Read a lesson (SEO path):** request → Next server renders the MDX page (static/SSR) + fetches
  that lesson's questions → HTML with crawlable content. No auth. *(F1)*
- **Buy credits:** app creates Stripe Checkout → user pays on Stripe → **webhook** (verified,
  idempotent) writes one `purchase` ledger row → balance = Σ ledger. *(F7)*
- **Book a 1:1:** app calls the booking RPC → RPC locks the slot `FOR UPDATE`, verifies open +
  balance ≥ 1, writes `spend` (−1), marks slot booked, creates the booking — all in one tx →
  app then creates Calendar event + Meet link and sends confirmation. *(F8)*
- **Reminders:** cron finds Sessions at ~24h/~1h without that reminder flag → emails → sets flag
  (idempotent). *(F8)*

## Failure boundaries

- **Booking vs side effects:** the credit spend + slot reservation + `bookings` row commit as one
  transaction; Calendar/Meet creation and the confirmation email are *after* and best-effort — a
  failure there never loses the booking or double-spends (retried; reminder can carry the link).
- **Webhook idempotency:** a `stripe_events` unique key makes redelivery a no-op; a missed event
  is safely credited on Stripe's retry (NFR-REL-001).
- **Concurrency:** the `FOR UPDATE` slot lock serializes competing bookings so a slot is booked
  at most once and at most one credit is spent for it (NFR-REL-002).
- **Cancellation:** idempotent — at most one `refund` per booking; slot always reopens.

## Deployment & scaling

- **Deploy:** Next.js app on Vercel; Supabase managed Postgres/Auth; Stripe; Google APIs; an
  email provider. Content ships in the repo, so a content update = a deploy.
- **Scaling assumptions:** read-heavy on free content (served static/SSR + cacheable — cheap to
  scale for organic traffic); write volume (accounts, purchases, bookings) is low (solo tutor
  capacity), so the DB and RPCs are not a scaling concern at launch.
- **Domain:** apex domain (reserved) points to this app at cutover, decided (spec/14 §14) and
  tracked as a launch checklist item (`TASK-OPS-001`); until then the v1 demo keeps `*.vercel.app`.

## Observability

- Money/booking actions (purchase, spend, refund, booking, admin override) are written to an
  audit log (`audit_log`, NFR-OPS). Platform request/error logs from Vercel + Supabase.
  Stripe dashboard is the payment source of truth to reconcile against the ledger.

## 9. Recorded architecture decisions

- **Content model:** ADR-001 — hybrid MDX-in-repo + questions-in-DB.
- **Codebase approach:** fresh Next.js app on `main`; port specific v1 modules (credit RPC,
  booking RPC, auth, notifications, UI tokens) per-milestone. *(No ADR — reversible, low blast
  radius.)*
- **Stack:** Next.js App Router + Supabase (Postgres/Auth/RLS/RPC) + Stripe + Tailwind v4 + Zod +
  TypeScript strict; content pages SSR/SSG.
- **Repo shape:** single app in the existing repo (`src/`, `content/`, `supabase/`, `spec/`,
  `adr/`).
- **Identity/consent, resolved:** there is no parent-consent gate. Learner profiles carry no
  credentials (INV-ACTOR-1, ADR-003) — one buyer login owns any number of profiles. This is not a
  pending decision; it is why no consent mechanism exists anywhere in this doc set.
