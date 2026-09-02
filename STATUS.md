# STATUS

Read this first when starting or resuming work. See `AGENTS.md` for the operating procedure.

**Project:** Provable Learning v2 — **free** K–12 math content + credit-based 1:1 tutoring.
**Branch:** `main` (fresh v2 app; v1 SAT platform frozen on `v1-sat`).
**Phase:** M0–M6 **code-complete** (2026-08-14); M7 is the launch checklist (`VERIFY.md` §5), not
further code. **Nothing has been live-verified** — this environment has no Docker and no real
Stripe/Google/Resend accounts. Read `VERIFY.md` before treating any of it as trustworthy.

## READ FIRST — the model as of 2026-08-14

**`spec/14_GROUND_TRUTH_INTERVIEW.md` is the ground truth**, as amended by **ADR-003/004/005**. The
whole spec set (`01`–`13`) has been rewritten against it and is current.

- **Content is FREE and public** — every lesson, no account, statically rendered. There is **no
  paywall and no course SKU** (ADR-004). Free content *is* the funnel (CON6).
- **Two products:** the **$49 First Session** (one per customer — ADR-005) and **credit packs**
  (1/$75 · 2/$120 · 4/$200 · 8/$350, 60-min sessions, never expire).
- **Credit packs carry essentially all revenue.** Credits + booking is the critical path.
- **Accounts:** one buyer login (Google OAuth / magic link, no passwords) with **learner profiles**
  beneath it — no child credentials, so **no consent gate**.
- **Solo tutor**, no tutor entity. 24h notice, 4-week horizon, free cancel/reschedule at 24h+, Meet
  link per booking created **after commit**, Resend email only, SMS a **manual worklist**.
- **Build order:** landing + accounts → money → progress + booking → admin + First Session → launch
  → author content (which gates nothing).

The three sections below record how the model got here; the details above supersede them where they
differ. `docs/` archived to `docs/archive/v1-sat/`.

## Pricing + ops decided (2026-08-14) — ADR-003

The second interview pass closed every open decision. See `spec/14` §11–§13 and `adr/003`.

- **Prices:** diagnosis **$49** (tripwire) · credits **1/$75 · 2/$120 · 4/$200 · 8/$350**. Closes
  D2/OQ1. *(The $19.99 course SKU was withdrawn hours later by ADR-004 — see below.)*
- **Consequence:** **credit packs are the whole revenue line**, so credits+booking is the critical
  path.
- **Solo tutor** (no tutor entity) · recurring weekly availability + exceptions · **UTC stored,
  browser-TZ displayed** · Meet link per booking via Calendar API **after commit** · **Resend**
  email · **Google OAuth + magic link**, no passwords · no self-serve refunds (manual Stripe +
  admin ledger adjustment) · samples via `sample: true` frontmatter · **apex domain** cutover
  (closes OQ3).

## Content is FREE (2026-08-14) — ADR-004, amends ADR-003

**There is no paywall.** The $19.99 course SKU is withdrawn; two products remain (credits +
diagnosis). Reasons: a paid SKU creates a delivery obligation that a partly-authored course can't
meet, and gating shrinks the SEO surface to a handful of samples when cold organic search *is* the
acquisition channel.

- **Every lesson is public and fully static** — max indexable surface, CWV preserved, and the
  catalog grows with every lesson authored.
- **Lead capture = "sign in to save your progress"** (`TASK-PROGRESS-001`), not a paywall.
- **Dropped from scope:** entitlements table, gating, buy prompts, the course Stripe product, and
  the `sample: true` frontmatter flag.
- **Authoring now gates nothing** — a partial free catalog is honest; unbuilt nodes read
  "coming soon".
- **Number to instrument first after launch:** diagnosis → credit-pack conversion. Revenue has no
  second leg if it's weak.

## The $49 SKU is "First Session" (2026-08-14) — ADR-005

Renamed from "Math Diagnosis" — that word presumed something was wrong and repelled the
getting-ahead and test-prep buyers, who are half the market.

- **$49, one per customer, enforced.** Framed as the session you buy *before* a pack, which is what
  explains $49 vs the $75 single credit.
- **Buyer states a goal at purchase**, and the goal selects the mode:
  `strengths` → roadmap-derived assessment · `test_prep` → hand-authored practice test ·
  **`class_help` → no assessment at all** (a pre-test tells you nothing you don't already know).
- **Probe-and-descend** for strengths mode: probe once per node in the prereq closure, skip solid
  subtrees, descend on failure, ~25-question cap. Reuses the transitive-prereq traversal already in
  `src/lib/content/layout.ts`.
- **Copy rule:** strengths and next steps, **never deficits**. No "diagnosis"/"behind"/"struggling".
- Also decided: K–12 full arc · US only · 24h notice, 4-week horizon · free reschedule at 24h+ that
  leaves the ledger untouched · no-show at 15 min with a credit-return request the operator approves
  · profiles hold name/grade/current class · completion = all questions correct · entity + Stripe
  already exist · Vercel Analytics.

## Current task

**M2 (close out the pivot) — paper work COMPLETE.** **M3 (landing + accounts) — IN PROGRESS.**

Done in M3:
- **TASK-CONFIG-001** — `src/lib/pricing.ts` (First Session $49, credit packs), drift test passing.
- **TASK-ROADMAP-002** — `course: true` marker + `courseId` inheritance in the roadmap; `courses()`
  enumerates algebra/geometry/precalculus/calculus for the picker.
- **TASK-AUTH-001** — `/login` (Google OAuth as a popup, not a full-page redirect — Google blocks
  iframes so a `window.open` popup is the real ceiling on "no page leave"), magic link,
  `/auth/callback`, `signOut`, `src/proxy.ts` session refresh. Code-complete; **not live-verified** —
  see follow-up 3 below.
- **TASK-LAND-001** — `src/app/page.tsx` rebuilt with the approved hero copy verbatim (spec/14 §14),
  prices pulled from `pricing.ts` (no retyped numbers). Primary CTA currently points at `/login`,
  not a checkout — see follow-up 4, revisit once FIRST-001/BILLING-001 ship. Lighthouse/CWV lab run
  still not done in this environment (same limitation as NFR-PERF-002, follow-up 1).

- **TASK-ACCT-001** — `supabase/migrations/0003_accounts.sql` (`accounts` auto-provisioned by a
  trigger on `auth.users`, `learner_profiles` beneath it, RLS scoping both to `auth.uid()`);
  `src/lib/accounts/*` (profile CRUD + active-profile "switching" via cookie, `currentCourseNode`
  validated against `courses()` from ROADMAP-002); `/profiles` page (redirects signed-out visitors
  to `/login`). Migration **not applied anywhere** — same unresolved-DB-password limitation as
  follow-up 2. Code-complete, not live-verified — see follow-up 3.

**M3 is now feature-complete on paper** (CONFIG-001, ROADMAP-002, AUTH-001, LAND-001, ACCT-001 all
code-complete). What's missing before calling M3 actually *done* is the live-verification pass
(follow-up 3) — this environment cannot run a local Supabase stack or confirm the linked project's
OAuth config, so nothing that touches Supabase Auth or RLS has been exercised against a real
database.

**M4 (money) — code-complete, not live-verified.** TASK-CREDIT-001 (`supabase/migrations/0004_credits.sql`
— ledger, purchases, stripe_events, `get_balance`/`spend_credit`/`process_purchase` RPCs),
TASK-BILLING-001 (`src/lib/billing/*` checkout SAs + `/api/webhooks/stripe`), TASK-BILLING-002
(`/wallet` page) are all built and tested (SQL-text invariant tests + SA/route unit tests — no live
Stripe/Supabase in this environment, same limitation as M3). See `VERIFY.md` §2.

**M5 (progress + booking, the critical path) — code-complete, not live-verified.**
TASK-PROGRESS-001 (`supabase/migrations/0005_progress.sql`, `src/lib/progress/*`, wired into
`checkAnswer`), TASK-AVAIL-001 (`0006_availability.sql`, `src/lib/booking/{slots,timezone,availability}.ts`
— DST-boundary-correct slot derivation, pure-logic tested), TASK-BOOK-001 (`0007_bookings.sql`,
`book_session` RPC — advisory-lock + partial-unique-index concurrency guard, `src/lib/booking/book.ts`),
TASK-BOOK-002/BOOK-005 (`0008_booking_lifecycle.sql` — `cancel_booking`/`reschedule_booking`/
`mark_no_show`/`resolve_credit_return_request`, `audit_log`, `src/lib/booking/manage.ts`),
TASK-BOOK-003 (`src/lib/booking/calendar.ts` — Google Calendar/Meet, resilient to failure by
design, mocked-Google unit tests), TASK-NOTIFY-001 (`0009_notifications.sql`,
`src/lib/notify/*`, `/api/cron/session-reminders` — idempotent via per-flag "only set on success"),
TASK-BOOK-004 (`/book` page — slot picker in the visitor's browser time zone, upcoming/past list,
cancel + no-show credit-return request UI) are all built and tested (SQL-text invariant tests +
pure-logic tests for slot generation/DST/windowing + mocked-external-service unit tests for
Stripe/Google/Resend — no live Supabase/Stripe/Google/Resend in this environment). 134 tests
passing, `next build` clean. See `VERIFY.md` §3.

**M6 (admin + First Session) — code-complete, not live-verified.** TASK-ADMIN-001
(`supabase/migrations/0010_admin.sql` — cross-account admin read policies + `refund_credit` RPC;
`src/lib/admin/*`; `/admin/*` pages: availability editor, bookings calendar + missing-Meet-link
queue, credit-return queue, users, question CRUD), TASK-ADMIN-002 (`0011_sms_worklist.sql` —
closes a spec gap: `accounts.phone`, buyer-settable on `/profiles`, since REQ-ADMIN-004 needs a
number and none existed; `/admin/reminders` worklist), TASK-FIRST-003 (`src/lib/assessment/probe.ts`
— stateless, replay-based probe-and-descend engine, fully pure-logic tested over fixture graphs,
no DB needed for the traversal itself), TASK-FIRST-004 (`0012_test_prep.sql` — hand-authored
`practice_tests`/`test_prep_questions`, mirrors `questions`' answer-secrecy shape;
`src/lib/assessment/test-prep.ts`), TASK-FIRST-001 (`0013_first_session.sql` — `assessments`/
`assessment_items`, `book_first_session` RPC that never spends a credit; `src/lib/assessment/
{first-session,session}.ts`; `/first-session` page routing by stated goal — `class_help` straight
to booking, `strengths`/`test_prep` through their pre-session step first; closes a second spec gap,
`assessments.test_slug`, since ADR-005's `test_prep` goal didn't name *which* test), TASK-FIRST-002
(`0014_session_notes.sql`, `src/lib/assessment/plan.ts` — pure written-plan renderer, works from
session notes alone in `class_help` mode; `/admin/bookings/[id]` plan page) are all built and
tested. 181 tests passing, `next build` clean (46 routes). **Not live-verified** — same limitation
as M3–M5, plus: most of the roadmap is unauthored so most `strengths`-mode probes hit the
no-content skip path in practice (documented in `session.ts`). See `VERIFY.md` §4.

**M6 completes the implementation plan through M7's build order** (`spec/12_IMPLEMENTATION_PLAN.md`
lists M7 as OPS-001 launch checklist + WORKSHEET-001 + continuous content authoring — none of which
are more code to write against this environment's limits). Per the owner's instruction to keep
implementing through M7 and collect every live check in one place: **the codebase is now
feature-complete against spec/12**. What remains is the live-verification pass this environment
cannot run (`VERIFY.md`, all four sections) and the genuinely non-code parts of M7 (Stripe live
products, Resend DNS, ToS/Privacy pages, apex DNS cutover, content authoring) — tracked in
`VERIFY.md` §5 and unchanged from `HANDOFF.md` §7.

**Spec-freshness cleanup (2026-08-14):** `06_ARCHITECTURE.md`, `08_API_CONTRACTS.md`,
`09_FRONTEND.md` were still **DRAFT/LIGHT** — never rewritten against spec/14 during TASK-SPEC-003 —
and had accumulated v1 leftovers (parent/dependent/consent language, `payer`/`owner`/`student`
roles instead of the `04_ACTORS.md` Buyer/Learner-profile/Admin-Tutor model, stale RPC param names,
a `FLOW-*` ID scheme `05_FLOWS.md` no longer uses). All three are now rewritten and consistent;
`10_BACKEND.md` (already "LIGHT (intentional)") got the same terminology pass. `00_README.md`'s ID
convention section was corrected to match `05_FLOWS.md`'s actual `F1`–`F13` numbering. **All of
`spec/00`–`13` are now current against spec/14 + ADR-003/004/005** — this was not true before today
despite `HANDOFF.md` §2 claiming it was.

For a comprehensive, up-to-date view of the system: **`spec/05_FLOWS.md`** is the end-to-end
flow-by-flow walkthrough (F1–F13, every actor journey including failure paths — this is the doc to
read to understand "what should happen"), and **`spec/13_COVERAGE_MATRIX.md`** is the audit view
(what's built vs not, ✅/🟡/⬜ per capability — this is the doc to read to check "what's actually
done"). Read them together.

**TASK-SPEC-004 done (2026-08-14)** — the layered `docs/` tree (L0 business, L1 context, L1′
invariants, L2 journeys one-per-`F*`, L3 components one-per-built-module) is rebuilt; start at
`docs/README.md`. It's a navigation/onboarding layer over `/spec`, not a duplicate — `/spec` stays
the single source of truth; fix conflicts there, not in `docs/`. No paper tasks remain open.

**No open blockers.**

**Open follow-ups (do not lose):**
1. **NFR-PERF-002 Core Web Vitals lab run** — pages are static + KaTeX-rendered server-side (no math
   CLS, next/font, minimal JS) so they meet CWV structurally, but a Lighthouse run on a deployed
   preview is the honest confirmation; not done in this environment. Run at first Vercel preview.
2. **Apply migrations `0002_questions.sql`, `0003_accounts.sql` + `seed.sql` to the remote Supabase
   projects.** All verified against a **local** stack only (and 0003 not even locally — no Docker
   here at all). The linked CLI points at the *prod* project ref (`vufizavpkjpybsknvyno`) and I
   don't have the dev project's DB password, so I did **not** push DDL remotely. Until `0002` is
   applied, `getLessonQuestions` returns `[]` on remote (pages still build/render — graceful) and no
   questions show. Until `0003` is applied, every `/profiles` query will fail (no `accounts` /
   `learner_profiles` tables exist yet — the page will error, not degrade). Apply via
   `supabase db push` (verify the target ref first) or the dashboard SQL editor, then re-run the
   seed.
3. **AUTH-001 and ACCT-001 need a live verification pass.** No Docker in this WSL distro (no local
   Supabase stack at all), and no confirmation that the linked project's Auth → Providers → Google
   is configured with the right redirect URLs. The code (OAuth popup, magic-link form, callback
   exchange, session refresh proxy, profile CRUD, RLS policies) is in place and builds clean, but
   none of it has actually run against Postgres: the OAuth round-trip, same-email identity linking,
   the `handle_new_user` trigger, profile CRUD, and RLS cross-account denial (AT-SEC-001) are all
   unexercised. Verify on a deployed preview or a machine with Docker before treating any of it as
   trustworthy.
4. **Landing page's primary CTA has nowhere real to land yet.** "Book your first session — $49"
   goes to `/login` because BILLING-001/FIRST-001 (checkout, First Session flow) don't exist. Point
   it at the real purchase flow once M6 ships.

## Completed

- Cleaned/archived agent memory; v2-focused index. v1 memory under `memory/archive/v1-sat/`.
- Ran the PRD interview; locked launch scope, account model, credits/booking model, tutor
  model, AI/lectures scope, success-criteria lens, course roadmap, minors stance.
- Wrote `spec/00_README.md`, `spec/01_PRD.md`, `spec/02_GLOSSARY.md`, `AGENTS.md`, this file,
  `CHANGELOG.md`.
- Ran a **business-truth review** (Lavish surface `.lavish/business-truth.html`). Outcomes fed
  into the PRD: acquisition = **cold organic search** (added CON6, SEO an `NFR-PERF` concern);
  wedge = **curated structured Learning Path** (not 1:1 help); positioning = math-anxious/
  beginner/supplementary/depth personas; actor terms switched to **Dependent/Independent
  Student + Parent**. No structural decisions reopened.

- **M0 scaffold (2026-07-10).** Cleared all v1 SAT code from `main` (preserved on `v1-sat`).
  Clean v2 base: ported navy/gold + Inter tokens, v2 landing + `SiteNav`, strict-mode build (no
  `ignoreBuildErrors`). Supabase clients (server/browser/admin) ported; baseline migration
  `0001_init.sql`; `content/` created; connectivity verified. See CHANGELOG.

## In progress

- **TASK-PRACTICE-001 (questions + answer checking, anonymous) — done (2026-07-11).** Added
  migration `0002_questions.sql` (`questions` table keyed by `lesson_slug`; per-type shape checks;
  world-readable rows but **column-level grants** hide `answer`/`tolerance`/`explanation` from
  anon/authenticated — the answer secret is read only server-side via service role) and
  `supabase/seed.sql` (5 questions across the 2 Geometry lessons, all three types). Added
  `src/lib/practice/*`: pure `checkSubmission` (mcq exact-match / numeric tolerance / free reveal;
  throws on non-numeric), `getLessonQuestions` (cookieless anon client, presentational columns
  only), and the `checkAnswer` server action (service-role read → check → `{ok,...}` result; no
  attempt recorded — that's PROGRESS-001). Added an interactive `PracticeQuestions` client component
  under the lesson page. Verified: 10 practice tests (pure logic + security-shape + slug-integrity);
  against a **local** Supabase stack, anon is denied the `answer` column (HTTP 401) while service
  role reads it, and the served lesson HTML shows question prompts/choices with **no answer or
  explanation leaked**. See open follow-up #2 re: applying the migration to remote.
- **TASK-CONTENT-001 (MDX pipeline + Learning Path) — pipeline done (2026-07-10).** Added
  `src/lib/content/*` (catalog build from in-repo MDX, ordered Course→Theme→Lesson, slug-integrity
  validation; MDX+KaTeX server render), `src/app/(content)/courses/**` routes (catalog / course /
  lesson, all SSG), global 404 with links back into the path, `sitemap.ts` + `robots.ts`, and
  per-page SEO metadata (title/description/canonical, `metadataBase`). Seeded a real 2-lesson
  Geometry slice to prove the pipeline (CONTENT-002 authors the full slice). AT-CONTENT-001/002/003
  verified in served HTML; 10 unit/integration tests pass; `next build` clean (content pages
  prerendered). Content/theme metadata convention recorded as an ADR-001 follow-up. Remaining:
  NFR-PERF-002 Lighthouse lab run (see Current task).

## Blockers

- **None.** D2 and OQ3 closed by ADR-003.

## Unresolved decisions

- **COPPA/consent mechanics** (CON3/OQ2) — **deferred, not resolved.** Learner profiles carry no
  credentials, so no consent gate is needed at launch. Returns only if profiles ever become real
  logins — keep owner identity separate from learner identity so that upgrade stays additive.

## Next task

**Nothing left to build against `spec/12_IMPLEMENTATION_PLAN.md`** — M0 through M6 are
code-complete, and M7 (`TASK-OPS-001`) is a launch checklist, not code (see `VERIFY.md` §5).
`TASK-WORKSHEET-001` is also built (`/courses/<slug>/worksheet`). `TASK-CONTENT-002` (authoring
"Math up to Geometry") is continuous content work, explicitly scoped to run post-launch and gate
nothing (ADR-004) — pick it up whenever, it never blocks anything else.

**The actual next step is the live-verification pass** — work through `VERIFY.md` top to bottom
(§0 environment setup, then §1–§5 in order) against a real Supabase project with Docker or a
deployed preview, real Stripe test-mode keys, a real Google account, and a real Resend account.
Nothing in this codebase has been exercised against any of those. Log each pass in `VERIFY.md`'s
sign-off table.

## Build / test status

- Build: **passing** (`next build`, Next 16, TS strict, no error-ignoring). 49 routes; content
  pages prerendered (○ catalog, ● course + lessons); everything touching Supabase degrades
  gracefully when a table/migration is absent. Lint clean.
- Tests: **181 passing** across 33 files. Every SQL migration has a companion "integrity" test
  that checks the migration's *text* for the invariant a live database would otherwise enforce
  (RLS policies, `SECURITY DEFINER` grants, idempotency guards) — a substitute for, not a
  replacement of, exercising the real database. Pure-logic modules (`booking/slots.ts`'s DST math,
  `assessment/probe.ts`'s traversal, `assessment/plan.ts`'s renderer, `progress/completion.ts`) are
  tested directly and are the most trustworthy code in the build, since they need no external
  service to verify. External services (Stripe, Google Calendar, Resend) are tested with the SDK
  call mocked, confirming this codebase's own error handling (never throws, degrades correctly) —
  not that the real integration works. Run with `npm test`.
- Last meaningful *live* verification: 2026-07-11 — PRACTICE-001 against a local Supabase stack
  (migrations 0001+0002 + seed): anon **denied** the `answer` column (HTTP 401), service role
  reads it; built lesson HTML shows question prompts/choices with no answer/explanation leaked.
  **Everything built since then (M3 onward) has zero live verification** — see `VERIFY.md`.
