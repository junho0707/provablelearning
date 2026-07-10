# Provable Learning v2 — Math Courses Platform (Build Plan)

> The pivot: from a subscription-based SAT tutoring ops platform (v1, frozen on `v1-sat`)
> to a **free math-courses platform** with **pay-per-credit tutoring** and a later
> **AI tutor Pro** tier. Fresh Next.js app on `main`, reusing v1's auth/Stripe/credits/booking
> patterns.

## Product model

```
FREE (open, no paywall)     PAID (credits)               PRO (subscription, later)
───────────────────────     ──────────────               ─────────────────────────
Browse all courses     →    Buy credit packs        →    AI Math Tutor
· explanations              Spend credits on:            (Claude over course
· examples                  · 1:1 tutor sessions          content via RAG)
· practice questions        · group lecture seats
(progress saved when
 logged in)
```

- **Credits:** 1 credit = one **45-minute** session. Packs start at **4 credits / $300**,
  with progressive per-credit discount on larger packs. One-time Stripe payments (not subs).
- **Free content is the funnel:** anyone reads lessons + attempts questions without an
  account; login only adds saved progress + attempt history.
- **Group lectures:** live scheduled sessions, seat-booked with credits.

## Content model

```
Course   "Math up to Geometry"          ┐
 └─ Theme    "Triangles"                 │  structure + prose: MDX + KaTeX in the repo
     └─ Lesson  "Pythagorean Theorem"    │  (git-versioned, free, no DB needed to read)
         ├─ explanation   (MDX)          ┘
         ├─ examples      (MDX)
         └─ questions     ── Supabase (structured, answer-checkable, tracks attempts)
```

**Course roadmap (ship one at a time):**
Math up to Geometry → Math before Calculus → Calculus 1 → Calculus 2.

**Authoring:** each lesson is an MDX file under `content/<course>/<theme>/<lesson>.mdx`
with frontmatter (title, order, slug). Questions for that lesson live in Supabase keyed by
the lesson slug, so progress/attempts are structured without duplicating the content tree in
the DB.

## Reuse map (pivot, not rewrite)

| Reuse ~as-is | Repurpose | Drop entirely | Build new |
|---|---|---|---|
| Supabase auth + Google OAuth, RLS patterns, notifications (email/SMS), UI design system (navy/gold, Inter) | **Credits** (makeup ledger → session-credit ledger), **Booking** (office hours → 1:1 + lectures, keep the `FOR UPDATE` atomic-reservation RPC), **Stripe** (subscriptions → one-time credit packs) | enrollments, classes, slots, waitlist, 3-phase drop, session-date math, Google Classroom provisioning | MDX+KaTeX content pipeline, course catalog + lesson pages, questions/attempts/progress, credit-pack purchase, credit-gated booking, (later) AI tutor |

## Data model (v2 Supabase)

New / kept:
- `profiles` — extends `auth.users`; role = `learner` | `tutor` | `admin`.
- `questions` — `id`, `lesson_slug`, `prompt`, `type` (`mcq`|`numeric`|`free`), `choices` (jsonb), `answer`, `explanation`, `position`.
- `question_attempts` — `user_id`, `question_id`, `submitted`, `is_correct`, `attempted_at`.
- `lesson_progress` — `user_id`, `lesson_slug`, `status`, `completed_at`.
- `credit_ledger` — `user_id`, `delta`, `reason` (`purchase`|`spend`|`refund`), `ref`, `created_at`; balance = `SUM(delta)`. Atomic spend via `SECURITY DEFINER` RPC with `FOR UPDATE` (ported from v1 `apply_credits`).
- `credit_packs` — `credits`, `price_cents`, `stripe_price_id` (config for pricing tiers).
- `tutor_availability` — `tutor_id`, `start_at`, `end_at`, `is_booked`.
- `bookings` — `slot_id`, `user_id`, `credits_spent`, `status`.
- `lectures` — `course_slug`, `title`, `start_at`, `capacity`, `credit_cost`.
- `lecture_seats` — `lecture_id`, `user_id`; atomic seat reservation RPC (ported from v1 `reserve_seat`).
- `notifications` — reuse.

Correctness-critical writes (credit spend, seat reservation) stay in Postgres RPCs behind
`SECURITY DEFINER` + `FOR UPDATE`, same discipline as v1. RLS: learners see own progress/
attempts/credits/bookings; content questions are world-readable; admin/tutor see relevant rows.

## Route map (App Router)

```
/                                   landing
/courses                            catalog (free)
/courses/[course]                   themes
/courses/[course]/[theme]/[lesson]  lesson (MDX) + questions
/pricing                            credit packs
/tutoring                           book 1:1 (spends credits)
/lectures                           browse + book live group lectures
/dashboard                          progress · credits · upcoming sessions
(auth)/login · signup · callback
/api/webhooks/stripe
/api/cron/*                         reminders, etc.
/admin                              content/questions, tutors, availability, lectures, users
```

## Build milestones (each independently shippable)

- **M0 — Scaffold.** Fresh Next 16 app on `main`; Supabase auth + Google OAuth; Tailwind v4 + port UI system; base layout/nav; env wiring.
- **M1 — Content (ships the free product).** MDX+KaTeX pipeline; catalog + theme + lesson pages; upload *Math up to Geometry*. **Live, useful, SEO-able site with zero auth needed.**
- **M2 — Progress & questions.** DB schema; question rendering + answer checking; attempt + progress tracking behind login.
- **M3 — Credits & payments.** Credit ledger + spend RPC; Stripe credit packs; purchase → webhook → ledger; balance UI.
- **M4 — 1:1 booking.** Tutor availability; book a 45-min session, spending 1 credit; reminders.
- **M5 — Group lectures.** Schedule lectures; credit-gated seat booking with atomic reservation.
- **M6 — AI Tutor (Pro).** Claude over course content (RAG); subscription gate. *(Design when we get here — will consult the Claude API reference for model choice.)*

Ship M1 early: it puts the free courses live on the domain and starts building an audience
before any payment plumbing exists.

## Open questions (resolve before the milestone that needs them)

1. **Parent/child accounts?** v1 had parents paying for dependent students. Does v2 need that,
   or is every buyer an individual learner? *(Default assumed: individual learners — simpler.
   Revisit before M3/M4.)*
2. **Exact credit-pack tiers** — 4/$300 is the base; need the 8/12/16 prices (per-credit
   discount curve) before creating Stripe products in M3.
3. **Domain cutover** — the domain's CNAME currently points at the static `provablelearning-site`
   repo. Repoint DNS to the v2 Vercel deployment when M1 is ready to be the public site.
