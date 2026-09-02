# Accounts & profiles

**Code:** `src/lib/accounts/{profiles,active-profile,types}.ts` · `src/app/(account)/profiles/*` ·
`supabase/migrations/0003_accounts.sql` · **Serves:** F3, F4 · **Status:** 🟡 code-complete, not
live-verified (migration applied to the remote project; OAuth/RLS round-trip unexercised — see below)

## What it does

CRUD for learner profiles under the signed-in buyer, plus tracking which profile is currently
"active" (being viewed/acted as).

## How it fits together

- **`profiles.ts`** — `listProfiles` / `createProfile` / `updateProfile` / `deleteProfile`. Every
  query runs through the **cookie-bound server client** (`supabase/server.ts`), never the admin
  client — so a cross-account read/write is denied by **Postgres RLS**, not by an `if` check in this
  file (`AT-SEC-001`). `createProfile` validates `currentCourseNode` against `courses()`
  (`content-pipeline.md`) so a profile can't point at a nonexistent roadmap node.
- **`active-profile.ts`** — which profile the buyer is currently viewing/acting as. Stored as a
  plain cookie (`active_profile_id`), **not a DB column** — this is UI state, not a fact about the
  account, so it has no row in `07_DATA_MODEL.md`. `setActiveProfile` re-checks the profile belongs
  to the caller before setting the cookie (RLS-checked read, not a separate ownership check).
- **`/profiles` page** — redirects signed-out visitors to `/login`; otherwise lists/creates/switches
  profiles.

## Migration `0003_accounts.sql`

`accounts` is auto-provisioned by a Postgres trigger on `auth.users` (so signing in for the first
time creates the account row with no separate application-level step); `learner_profiles` sits
beneath it with RLS scoping both tables to `auth.uid()`.

## Not yet verified

**2026-08-18 update:** confirmed via direct REST queries against the live Supabase project
(`mlhlugfzzsigraqcxgmh`) that migration `0003` (and all of `0001`-`0014`) is applied — the
`accounts`/`learner_profiles` tables exist, so `/profiles` no longer fails outright for that reason.

What's still genuinely unverified: no Docker/local Supabase stack in the dev environment, and no
confirmation the linked project's Auth → Providers → Google is configured with the right redirect
URLs, so the OAuth round-trip, the `handle_new_user` trigger, profile CRUD, and RLS cross-account
denial (`AT-SEC-001`) have never actually run end-to-end. Track this via `VERIFY.md`, not here.

## Invariants it upholds

`INV-ACTOR-1` (`02-invariants.md`) — `accounts` and `learner_profiles` stay separate tables even
for an independent student with one profile representing themselves.
