# F3 — Sign in

**Actor:** Visitor → Buyer · **Status:** 🟡 code-complete, not live-verified

## Trigger

Chooses Google OAuth or email magic link from `/login`.

## Steps

1. Picks Google OAuth (opened as a **popup**, not a full-page redirect — Google blocks OAuth inside
   iframes, so `window.open` is the real ceiling on "no page leave") or a magic-link email.
2. **Same email via either method resolves to one account** — Supabase identity linking, not two
   separate accounts (`REQ-AUTH-002`).
3. `/auth/callback` exchanges the code/token for a session; `src/proxy.ts` refreshes the session on
   subsequent requests.
4. First sign-in prompts creating a first **learner profile** (`name`, `grade`, `current math
   class`) — which may represent the buyer themselves (independent student, `INV-ACTOR-1`).

## Guards / invariants

- `INV-ACTOR-1` — the account row and the first learner profile are created as separate records
  even in the independent-student case.
- No password anywhere (ADR-003) — no reset flow, no breach surface to design around.

## Failure paths

- Google popup blocked/closed → user retries; no partial account state is created.
- Magic-link email not delivered → Resend failure is a side effect of sending, not of the account
  creation itself.

## Not yet verified

Code-complete but **unexercised against real Postgres**: no Docker in the dev environment, so no
local Supabase stack, and no confirmation the linked project's Auth → Providers → Google is
configured with the right redirect URLs. The OAuth round-trip, same-email identity linking, and the
`handle_new_user` trigger are all unverified. **Verify on a deployed preview before trusting this
flow.** (`STATUS.md` follow-up 3.)

## Requirements / tests

`REQ-AUTH-001..002` · `AT-ACCT-001..004`, `AT-SEC-001`.

## Components

`components/auth.md`, `components/accounts.md`.
