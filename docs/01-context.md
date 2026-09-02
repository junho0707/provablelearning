# L1 — Context

*Who uses the system, what it depends on, and the full catalog of journeys it supports. Source:
`spec/04_ACTORS.md`, `spec/06_ARCHITECTURE.md` §System context, `spec/05_FLOWS.md`, `spec/02_GLOSSARY.md`.*

## The identity model, in one line

**One login per buyer. Learner profiles beneath it, with no credentials of their own.**

This is the single most important structural fact in the system: a learner profile is not an
account and cannot log in, which is *why there is no minors'-consent gate* — no child ever holds
credentials. `accounts` and `learner_profiles` are kept as separate tables even when the buyer *is*
the learner (independent student), because collapsing them would make a future profile→login
upgrade a migration instead of an additive change. See `INV-ACTOR-1` in `02-invariants.md`.

## Actors

| Actor | Who | Can | Cannot |
|---|---|---|---|
| **Visitor** | Anyone, anonymous | Read every lesson, attempt every question, browse the roadmap, see prices | Save progress, buy, book, see answer keys |
| **Buyer** | The one authenticated human per account (parent, or the student themselves) | Everything a Visitor can + manage learner profiles, buy First Session (once) and credit packs, book/cancel/reschedule, request a no-show credit back | See another account's data, grant themselves credits, book without a credit, buy a second First Session |
| **Learner profile** | Under a buyer; no credentials | *(not an actor with agency — a record the buyer manages)* | Log in, exist without a buyer |
| **Admin-Tutor** | The one operator; both tutor and admin | Author content, set availability, see all bookings, CRUD questions, adjust the ledger, approve/deny credit-return requests, run reminders manually, deliver sessions | *(no product-level restriction — owner)* |
| **System** | Not a person; scheduled jobs + webhooks | Handle the Stripe webhook, send Resend email, run the reminder cron, create the Calendar event/Meet link after commit | Roll back a booking because a side effect (Calendar) failed |

Full capability matrix: `spec/04_ACTORS.md`. RLS enforces every "cannot" above at the data layer,
not just in application code (`spec/06_ARCHITECTURE.md` §Boundaries & trust).

## External dependencies

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
                     └─────────────────────►│  Email      │  Resend, transactional only
                                            └─────────────┘
```

| Dependency | Used for | Trust boundary |
|---|---|---|
| **Supabase** | Postgres (system of record), Auth (Google OAuth + magic link), RLS, `SECURITY DEFINER` RPCs | Data tier; RLS is the *primary* authorization boundary |
| **Stripe** | One-time Checkout for First Session + credit packs | Server-to-server webhook is the *only* trusted trigger that credits the ledger — the browser redirect is not trusted |
| **Google** | OAuth sign-in identity + Calendar/Meet link per booking | Best-effort side effect after booking commit; failure never loses a booking |
| **Resend** | Transactional email — confirmations, reminders, receipts | Best-effort side effect |
| **Vercel** | Hosting, Vercel Analytics | Cannot measure the First-Session → credit-pack conversion rate the model rests on — reconstructed from Stripe by hand until PostHog is adopted |

Content prose lives as in-repo MDX (`content/*.mdx`), read at build/render time — not in Supabase.
Everything dynamic (accounts, money, bookings, progress) lives in Supabase. See
`components/content-pipeline.md` for how MDX + `roadmap/roadmap.json` + the `questions` table
combine into a rendered lesson.

## Journey catalog

Full walkthroughs live in `journeys/`; this is the map. "Status" mirrors
`spec/13_COVERAGE_MATRIX.md`.

| # | Journey | Actor | Trigger | Status |
|---|---|---|---|---|
| F1 | Read a lesson | Visitor | Arrives from search or the roadmap | ✅ built |
| F2 | Explore the roadmap | Visitor | Opens `/roadmap` | ✅ built |
| F3 | Sign in | Visitor → Buyer | Chooses Google or magic link | 🟡 code-complete, not live-verified |
| F4 | Saved progress | Buyer | Signed in, attempts a question | ⬜ not started |
| F5 | Buy the First Session | Buyer | Clicks "Book your first session — $49" | ⬜ not started |
| F6 | Strengths & weaknesses assessment | Learner (alone) | After First Session purchase, `strengths` goal | ⬜ not started |
| F7 | Buy credit packs | Buyer | From wallet or post-session prompt | ⬜ not started |
| F8 | Book a session | Buyer | Has ≥1 credit, picks a slot | ⬜ not started |
| F9 | Cancel or reschedule | Buyer | Has an upcoming booking | ⬜ not started |
| F10 | No-show & credit return | Buyer + Admin-Tutor | Student misses a session by 15+ min | ⬜ not started |
| F11 | Operator: availability | Admin-Tutor | Manages the weekly template + exceptions | ⬜ not started |
| F12 | Operator: session day | Admin-Tutor | Works reminders, delivers, marks status | ⬜ not started |
| F13 | Operator: refunds | Admin-Tutor | A refund is owed | ⬜ not started |

## Glossary pointers

Canonical domain terms (Buyer, Learner profile, First Session, credit, slot, node, etc.) are
defined once in `spec/02_GLOSSARY.md`. Use those terms consistently in this tree and in code —
don't invent synonyms.

## Downstream

`02-invariants.md` — the facts that must always hold and the traps around them.
`journeys/` — one file per row above.
