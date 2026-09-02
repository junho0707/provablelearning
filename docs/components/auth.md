# Auth

**Code:** `src/lib/auth/actions.ts` · `src/app/(auth)/login/*`, `src/app/(auth)/auth/callback/route.ts` ·
`src/proxy.ts` · **Serves:** F3 · **Status:** 🟡 code-complete, not live-verified

## What it does

Google OAuth + email magic link sign-in, no passwords, both landing on one callback route so
Supabase can link same-email identities into a single account.

## How it fits together

- **`login/google-button.tsx`** — opens Google OAuth as a **popup** (`window.open`), not a
  full-page redirect. Google blocks OAuth inside an iframe, so a popup is the actual ceiling on "no
  page leave" for this method.
- **`login/magic-link-form.tsx`** + **`auth/actions.ts`**'s `sendMagicLink` — a form action built
  for `useActionState`: returns a typed state (`idle`/`sent`/`error`) instead of throwing, so the
  page can render feedback inline. Calls `supabase.auth.signInWithOtp` with
  `emailRedirectTo: <app>/auth/callback`.
- **`auth/callback/route.ts`** — both methods land here; exchanges the code/token for a session.
  Same email via either method resolves to one account automatically (Supabase identity linking) —
  no custom linking logic in this codebase.
- **`src/proxy.ts`** — runs on every request (Next.js middleware); its only job is calling
  `supabase.auth.getUser()` so the session cookie gets refreshed. **No route protection here** —
  RLS is the actual access boundary, this just prevents a signed-in session from silently expiring
  mid-visit.
- **`signOut`** (`auth/actions.ts`) — clears the session, redirects to `/`.

## What it explicitly does not do

No password flow, no reset flow — there is no password to reset (ADR-003). No route-level
authorization in `proxy.ts` — a request to a page that needs a session is not blocked here; the
page (or RLS underneath it) is responsible.

## Not yet verified

Code-complete but **unexercised against real Postgres** — no Docker in the dev environment (no
local Supabase stack), and no confirmation the linked project's Auth → Providers → Google is
configured with the right redirect URLs. The full round-trip (popup → callback → session →
`handle_new_user` trigger firing) has never actually run. See `journeys/f3-sign-in.md` and
`STATUS.md` follow-up 3 before trusting this in production.

## What depends on it

`components/accounts.md` (profile CRUD needs `auth.getUser()` to resolve the caller).
