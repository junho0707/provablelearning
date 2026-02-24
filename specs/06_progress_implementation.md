# ProvableLearning — Implementation Progress

**Last Updated:** 2026-02-21

---

## Overall Status: Feature-Complete + Audited

All 14 implementation phases are complete with **90+ TypeScript files** and **34 SQL migrations**. Multiple audits fixed ~30 issues. TypeScript compiles with 0 errors, 104 tests passing.

> **Note:** This is the original progress doc. The canonical, up-to-date progress doc is `specs/08_progress_master.md`.

---

## Phase-by-Phase Progress

### Phase 1: Project Setup — COMPLETE
- [x] Next.js 15 App Router with `src/` directory
- [x] TypeScript strict mode, path aliases (`@/*`)
- [x] Tailwind CSS 4 + PostCSS
- [x] Supabase, Stripe, Zod dependencies
- [x] `.env.local.example` with all required keys
- [x] `vercel.json` with 4 cron jobs configured

### Phase 2: Database Schema & Migrations — COMPLETE
34 migrations covering all tables, constraints, triggers, RPC, RLS, indexes, makeup system, and policy updates. See `08_progress_master.md` for full list. Original 23 shown below:

| Migration | Description | Status |
|-----------|-------------|--------|
| 00001 | Enums (role, group_size_type, enrollment_status, etc.) | Done |
| 00002 | Users table + role immutability trigger | Done |
| 00003 | Students table + parent role validation + phone enforcement | Done |
| 00004 | Modules table + btree_gist EXCLUDE constraint (date overlaps) | Done |
| 00005 | Cohorts table + capacity CHECK per group_size_type | Done |
| 00006 | Enrollments table + 3 UNIQUE constraints | Done |
| 00007 | Waitlist table | Done |
| 00008 | Performance logs table | Done |
| 00009 | Credits table + CHECK remaining_amount | Done |
| 00010 | Admin logs table | Done |
| 00011 | `reserve_seat` RPC (atomic FOR UPDATE row lock) | Done |
| 00012 | `release_seat` RPC | Done |
| 00013 | Module overlap trigger | Done |
| 00014 | Re-enrollment limit trigger | Done |
| 00015 | Phone enforcement triggers | Done |
| 00016 | 17 indexes (joins, search, sort) | Done |
| 00017 | Enable RLS on all tables | Done |
| 00018 | RLS policies (own data, parent-child, admin-all) | Done |
| 00019 | pg_cron jobs (pending cleanup, waitlist expiry) | Done |
| 00020 | Auth trigger (auth.users → public.users + students) | Done |
| 00021 | Guardrail triggers (delete protection, capacity floor, audit) | Done |
| 00022 | Agreement immutability trigger | Done |
| 00023 | `apply_credits` RPC (atomic FIFO deduction with FOR UPDATE) | Done |

### Phase 3: Supabase Clients — COMPLETE
- [x] `src/lib/supabase/client.ts` — Browser client
- [x] `src/lib/supabase/server.ts` — Server component client (cookie handling)
- [x] `src/lib/supabase/admin.ts` — Admin client (service role key)

### Phase 4: Authentication — COMPLETE + AUDITED
- [x] `src/app/(auth)/login/page.tsx` — Email/password + Google OAuth
- [x] `src/app/(auth)/signup/page.tsx` — Role selector (parent/student), passes role through OAuth redirect
- [x] `src/app/(auth)/signup/actions.ts` — Validation, prevents admin self-creation
- [x] `src/app/(auth)/callback/route.ts` — OAuth callback, forwards role param to onboarding for new users
- [x] `src/app/(auth)/onboarding/page.tsx` — Name + phone collection, role locked when passed via URL param
- [x] `src/lib/auth/get-user-role.ts` — Returns userId + role
- [x] `src/lib/auth/google-oauth.ts` — Google OAuth client function (accepts redirectTo for role forwarding)

### Phase 5: Middleware & Route Protection — COMPLETE
- [x] `src/middleware.ts` — Session refresh, public path whitelist, role-based routing, phone onboarding check

### Phase 6: Validators & Types — COMPLETE
- [x] `src/lib/types.ts` — Full interfaces (User, Student, Module, Cohort, Enrollment, etc.)
- [x] `src/lib/constants.ts` — Prices, group size ranges, limits
- [x] `src/lib/validators/module.ts` — Zod schema with date validation
- [x] `src/lib/validators/cohort.ts` — Zod schema with capacity range validation

### Phase 7: Enrollment Flow — COMPLETE + AUDITED
- [x] `src/lib/enrollment/check-eligibility.ts` — 5-point validation (duplicates, started, conflicts, re-enroll limit)
- [x] `src/lib/enrollment/reserve.ts` — Calls `reserve_seat` RPC
- [x] `src/app/(dashboard)/enroll/page.tsx` — Browse upcoming modules/cohorts
- [x] `src/app/(dashboard)/enroll/[cohortId]/page.tsx` — Detail + eligibility check + waitlist join with student selector
- [x] `src/app/(dashboard)/enroll/[cohortId]/enroll-form.tsx` — Student selector, agreement checkboxes, empty students guard
- [x] `src/app/(dashboard)/enroll/[cohortId]/actions.ts` — Full flow: eligibility → reserve → credits → Stripe (with rollback on Stripe failure)
- [x] `src/app/(dashboard)/enroll/success/page.tsx` — Confirmation page (credit vs Stripe message)
- [x] `src/app/(dashboard)/enroll/cancel/page.tsx` — Cancellation page with browse link

### Phase 8: Stripe Integration — COMPLETE + AUDITED
- [x] `src/lib/stripe/client.ts` — SDK instance (API version 2026-01-28.clover)
- [x] `src/lib/stripe/prices.ts` — Price lookup by group size
- [x] `src/lib/stripe/create-checkout.ts` — Checkout session with configurable expiry (uses PENDING_ENROLLMENT_TTL_MINUTES constant)
- [x] `src/lib/stripe/webhook-handlers.ts` — Completed/expired handlers + reconciliation (uses shared notifyNextOnWaitlist)
- [x] `src/app/api/webhooks/stripe/route.ts` — Signature verification + event dispatch

### Phase 9: Credits System — COMPLETE + AUDITED
- [x] `src/lib/credits/get-balance.ts` — Sum active, non-expired credits
- [x] `src/lib/credits/apply-credits.ts` — Atomic FIFO deduction via `apply_credits` RPC (FOR UPDATE row locks, prevents double-spending)
- [x] `src/app/(dashboard)/admin/credits/` — Issuance form + history table

### Phase 10: Waitlist System — COMPLETE
- [x] `src/lib/waitlist/join.ts` — Add to waitlist (dedup)
- [x] `src/lib/waitlist/notify-next.ts` — Auto-notify + stale expiry
- [x] `src/app/(dashboard)/enroll/waitlist-offer/[waitlistId]/page.tsx` — 24-hr claim window

### Phase 11: Dashboards — COMPLETE

**Parent Dashboard** (`src/app/(dashboard)/parent/page.tsx`):
- [x] Children cards with grade, status, credit balance
- [x] Attendance/homework stats
- [x] Active enrollments with module + cohort details
- [x] "Add Child" button + `/parent/add-child` page (name + grade form)
- [x] Empty state directs to add-child instead of "contact admin"

**Student Dashboard** (`src/app/(dashboard)/student/page.tsx`):
- [x] Profile and enrollments
- [x] 8-session attendance grid
- [x] Homework completion indicator
- [x] Makeup request link

**Admin Dashboard** (`src/app/(dashboard)/admin/page.tsx`):
- [x] Stats grid (enrollments, students, modules)
- [x] Navigation to all admin sub-pages (including Export link)

### Phase 12: Admin Modules — COMPLETE + AUDITED
- [x] **Modules** — CRUD with overlap validation, delete protection
- [x] **Cohorts** — CRUD with capacity validation, module linking
- [x] **Students** — List + parent linking
- [x] **Performance** — Bulk logging (attendance + homework per session)
- [x] **Credits** — Issuance with reason + expiry
- [x] **Refunds** — Stripe refund or credit issuance per group type (Stripe refund before status update)
- [x] **Logs** — Audit log viewer (100 most recent)
- [x] **Export** — CSV export (enrollments, performance, credits, students)

### Phase 13: Student Features — COMPLETE + AUDITED
- [x] `src/app/(dashboard)/student/makeup/` — Makeup request form (max 2 for small groups, action renamed to `student_makeup_request`)

### Phase 14: Cron Jobs & API Routes — COMPLETE
- [x] `src/app/api/cron/reconcile/route.ts` — Stripe vs DB mismatch detection
- [x] `src/app/api/cron/waitlist-notify/route.ts` — Expire stale + auto-notify
- [x] `src/app/api/cron/backup/route.ts` — CSV export (Drive upload not wired)
- [x] `src/app/api/cron/reports/route.ts` — Data fetch (PDF generation not wired)
- [x] `src/app/api/auth/signout/route.ts` — Sign out handler
- [x] `src/app/api/export/route.ts` — Admin CSV download

---

## Remaining TODOs

### High Priority
| Item | File | Notes |
|------|------|-------|
| Email/SMS for waitlist notifications | `waitlist/notify-next.ts` | DB records created, but no delivery (needs SendGrid/Twilio) |
| Enrollment confirmation emails | — | Not implemented |

### Medium Priority
| Item | File | Notes |
|------|------|-------|
| Google Drive backup upload | `cron/backup/route.ts` | CSV export works, Drive API not wired |
| PDF report generation | `cron/reports/route.ts` | Data fetched, needs @react-pdf/renderer |
| Email PDF reports to parents | `cron/reports/route.ts` | Not implemented |

### Low Priority
| Item | Notes |
|------|-------|
| Rate limiting on API routes | Consider Vercel Rate Limiting or middleware |
| Error tracking (Sentry/Datadog) | Currently console.error only |
| Custom error.tsx pages | No global error boundary per route group |
| Unit/integration tests | 104 tests across 10 files (vitest) |

---

## Quality Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| TypeScript Strictness | Excellent | Strict mode, no `any` abuse, proper type casting |
| Database Constraints | Excellent | 14+ triggers, 17 indexes, RLS, atomic RPC |
| Security | Strong | RLS enforced, admin-only actions, CRON_SECRET, Stripe signature verification |
| Error Handling | Good | Server actions return error objects; global error boundary missing |
| Testing | Strong | 104 tests across 10 files (vitest) |
| State Management | Excellent | Mostly server components + server actions |
| UI/UX | Functional | Tailwind utility classes, clean but not polished |
| Code Organization | Excellent | Clear file structure, single responsibility |

---

## Deployment Setup Progress

### Supabase — COMPLETE (2026-02-21)
- [x] Supabase project created
- [x] Project URL + anon key + service role key copied to `.env.local`
- [x] Email/password auth provider enabled
- [x] Google OAuth provider configured (Google Cloud OAuth Client ID + Secret)
- [x] btree_gist extension enabled
- [x] pg_cron extension enabled
- [x] All 23 migrations pushed successfully (00024-00034 pending)
- [x] **Migration fix applied:** `00003` — removed invalid subquery CHECK constraint (parent role validation enforced by trigger instead)
- [x] **Migration fix applied:** `00019` — fixed nested `$$` dollar-quote conflict in pg_cron jobs (changed outer to `$outer$`)

### Stripe — PENDING
- [ ] Stripe account created
- [ ] Webhook endpoint configured for checkout events
- [ ] API keys copied to `.env.local`

### Vercel / Local Dev — PENDING
- [ ] Environment variables set
- [ ] `npm install` + `npm run dev` tested
- [ ] Admin user seeded

### Remaining Prerequisites
1. **Stripe account** — Webhook endpoint configured for checkout events
2. **Seed admin user** — Manual INSERT via Supabase SQL Editor
3. **Environment variables** — Stripe keys + CRON_SECRET still needed
4. **Test local dev** — `npm run dev`
