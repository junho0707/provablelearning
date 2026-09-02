# 09 — Frontend Design

Status: **REWRITTEN 2026-08-14** against `14_GROUND_TRUTH_INTERVIEW.md` + ADR-003/004/005 ·
`04_ACTORS.md` + `05_FLOWS.md`. Per the plan, detailed component/state design is carried in each
`TASK-*`'s implementation notes rather than duplicated here. This file records only route
structure, cross-cutting states, and the FE↔contract mapping. Contracts: `08_API_CONTRACTS.md`.

## Route structure (App Router)

Built (M1–M3): `/`, `/courses`, `/courses/[slug]`, `/roadmap`, `/login`, `/auth/callback`,
`/sessions`, `/account`. Everything else below is planned, not yet built — no `/pricing`, `/tutoring`,
`/parent`, `/dashboard`, or `signup`/`reset` routes: there is no course to price separately from
the roadmap, no signup step (first sign-in auto-provisions an `accounts` row), and no password to
reset (ADR-003).

```
/                                   landing — the First Session CTA is the entry flow (F5)
/courses                            catalog (SSR/SSG, public)
/courses/[slug]                     lesson (MDX) + questions (public)
/roadmap                            full skill-tree map, pan/zoom + mobile outline (public)
(auth)/login                        Google OAuth (popup, not full-page — F3) + magic link
(auth)/auth/callback                code exchange; also the OAuth popup's close-and-postMessage page
/sessions                           balance · buy credits · slot picker (visitor's TZ) · upcoming/past sessions (buyer, F7/F8/F9)
/account                            learner-profile CRUD + "switch active profile" · contact number · order history (buyer, F4)
/first-session                      goal picker → checkout → assessment or straight to booking (F5/F6) — planned, TASK-FIRST-001
/admin/*                            authoring, availability, calendar, refunds, users (admin, F11–F13) — planned, TASK-ADMIN-001/002
/api/webhooks/stripe · /api/cron/*
```

## Cross-cutting states (apply to every data view)

- **Loading** — skeletons; content pages never block on client JS for primary text (NFR-PERF-001).
- **Empty** — e.g. no credits → "buy a pack" CTA; no learner profiles → "add a profile"; no open
  slots → "check back".
- **Error** — money/booking conflicts surface the contract's 402/409 as actionable messages
  ("slot just taken — pick another", "not enough credits — buy a pack"), never a raw 500.
- **Auth-gated** — buyer/admin routes redirect anonymous visitors to `/login`. There is no
  intermediate consent state to render — a learner profile is usable the instant it's created
  (INV-ACTOR-1).

## Interaction → contract mapping

| UI action | Contract (08) | Notes |
|---|---|---|
| Submit/reveal a question | `checkAnswer` | answer never in client payload for auto-check |
| Add / edit / switch a learner profile | `createProfile`/`updateProfile`/`setActiveProfile` | built (ACCT-001), see `/account` |
| Buy a credit pack | `createCreditsCheckout` → Stripe | balance updates on webhook, not redirect |
| Buy the First Session | `createFirstSessionCheckout` → Stripe | 409 if already purchased (INV-MONEY-2) |
| Book a slot | `bookSession` | handle 402/409 inline |
| Cancel / reschedule a session | `cancelBooking` / `rescheduleBooking` | show refunded-vs-forfeit vs ledger-untouched per 24h rule |

## Responsive & a11y

Mobile-first (content read on phones from search); semantic headings for SEO + a11y; KaTeX with
accessible math output; forms keyboard-navigable with visible focus. Design system: navy/gold +
Inter (ported v1 tokens).
