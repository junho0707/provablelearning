# 09 — Frontend Design

Status: **LIGHT (intentional)** · Per the plan, detailed component/state design is carried in each
`TASK-*`'s implementation notes rather than duplicated here. This file records only route
structure, cross-cutting states, and the FE↔contract mapping. Contracts: `08_API_CONTRACTS.md`.

## Route structure (App Router)

```
/                                   landing
/courses                            catalog (SSR/SSG, public)
/courses/[course]                   themes (public)
/courses/[course]/[theme]/[lesson]  lesson (MDX) + questions (public)
/pricing                            credit packs (public; CTA gated to payer)
/tutoring                           book 1:1 (payer)
/dashboard                          progress · balance · upcoming sessions (student/payer)
/parent                             manage dependents · book for a child (parent)
/admin/*                            authoring, availability, calendar, refunds, users (admin)
(auth)/login · signup · callback · reset
/api/webhooks/stripe · /api/cron/*
```

## Cross-cutting states (apply to every data view)

- **Loading** — skeletons; content pages never block on client JS for primary text (NFR-PERF-001).
- **Empty** — e.g. no credits → "buy a pack" CTA; no dependents → "add a student"; no open slots
  → "check back".
- **Error** — money/booking conflicts surface the contract's 402/409 as actionable messages
  ("slot just taken — pick another", "not enough credits — buy a pack"), never a raw 500.
- **Auth-gated** — payer/parent/admin routes redirect anonymous users to login; dependents in
  `pending` consent see the pre-consent prompt.

## Interaction → contract mapping

| UI action | Contract (08) | Notes |
|---|---|---|
| Submit/reveal a question | `checkAnswer` | answer never in client payload for auto-check |
| Buy a pack | `createCheckout` → Stripe | balance updates on webhook, not redirect |
| Book a slot | `bookSession` | handle 402/409 inline |
| Cancel a session | `cancelBooking` | show refunded vs forfeit per 24h rule |
| Add/consent dependent | `createDependent`/`grantConsent` | shapes pending ADR-002 |

## Responsive & a11y

Mobile-first (content read on phones from search); semantic headings for SEO + a11y; KaTeX with
accessible math output; forms keyboard-navigable with visible focus. Design system: navy/gold +
Inter (ported v1 tokens).
