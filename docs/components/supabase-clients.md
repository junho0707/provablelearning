# Supabase clients

**Code:** `src/lib/supabase/{admin,client,public,server}.ts` · **Serves:** everything else in this
catalog · **Status:** ✅ built

## What it does

Four Supabase client constructors, each scoped to a specific trust level and calling context. The
choice of *which one* a piece of code uses is itself a security-relevant decision — see
`spec/06_ARCHITECTURE.md` §Boundaries & trust.

| Client | File | Auth | Bypasses RLS | Use for |
|---|---|---|---|---|
| **Admin** | `admin.ts` | Service-role key | **Yes** | Server-only, trusted paths only: reading question answers (`practice.md`), the future Stripe webhook |
| **Server** | `server.ts` | User session, from cookies | No | RSC / route handlers acting *as the signed-in user* — profile CRUD, anything RLS should gate |
| **Public** | `public.ts` | `anon` role, cookieless | No (and no session to have) | Public content reads during static generation — safe to call at build time, never touches `cookies()` |
| **Browser** | `client.ts` | Browser session | No | Client Components that need Supabase directly |

## Why four, not one

- **Admin vs. server** is the money/security line: admin bypasses RLS entirely, so its use is
  meant to be rare and auditable (currently only `practice/actions.ts`'s answer read). Reaching for
  admin instead of server to "make a query work" is the failure mode this split exists to prevent —
  it would silently disable RLS for that read.
- **Public vs. server** is the static-generation line: `public.ts` never calls `cookies()`, so code
  using it is safe inside a statically-generated page; `server.ts` always is request-scoped and
  would break static generation if called from a build-time path.

## `src/proxy.ts`

Not a client itself, but the piece that keeps `server.ts`/`client.ts` sessions alive: runs
`supabase.auth.getUser()` on every request (Next.js middleware) purely to refresh the session
cookie. Required by `@supabase/ssr` — without it, a signed-in session silently expires mid-visit.
Does **not** gate routes; that's RLS's job, enforced at the data layer regardless of what middleware
does or doesn't check.
