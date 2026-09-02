# Changelog

Meaningful completed changes only (not a raw command log).

## 2026-08-14 — M7: launch checklist, legal pages, worksheets, analytics — implementation plan complete

Added `@vercel/analytics` (spec/14 §17) and wired `<Analytics />` into `src/app/layout.tsx`. Wrote
`/terms`, `/privacy`, `/refund-policy` — real, product-accurate content (Stripe for payments, Google
for OAuth/Calendar, Resend for email, no SMS integration, credits never expire, the 24h cancellation
rule, no self-serve refunds) with `[BRACKETED]` placeholders for the legal-entity facts (name,
address, jurisdiction, contact email) this codebase has no source of truth for and did not invent;
linked from the landing footer. Built `TASK-WORKSHEET-001` — a printable worksheet page per lesson
(`/courses/<slug>/worksheet`, browser print-to-PDF, no PDF library) generated from the same question
bank as interactive practice, with an answer key. Updated the landing page's primary CTA from
`/login` to `/wallet` now that a real First Session checkout exists (BILLING-001/FIRST-001).

Consolidated the remaining `TASK-OPS-001` items — live Stripe products, Resend DNS, apex cutover,
backups/audit-log spot-check, Lighthouse, real-card end-to-end money test — into `VERIFY.md` §5;
none of them are code this session can write. Closed out `spec/13_COVERAGE_MATRIX.md`'s gap list
(AT-CONTENT-005 and the landing CTA gap were both resolved earlier in M3/M4 and are now marked so)
and marked M2–M7 in `spec/12_IMPLEMENTATION_PLAN.md` with accurate status badges.

**Every task in `spec/12_IMPLEMENTATION_PLAN.md` with a code deliverable is now code-complete.**
181 tests passing (unchanged — this milestone's additions are pages, not logic worth a unit test:
static legal-content pages and a worksheet renderer that's a straightforward re-projection of
already-tested question data), `next build` clean, 49 routes. What remains is exactly the
live-verification pass this environment cannot run (`VERIFY.md`, all five sections — real Supabase
with Docker, Stripe, Google, and Resend accounts needed) and the non-code launch steps in
`VERIFY.md` §5. `TASK-CONTENT-002` (authoring "Math up to Geometry") remains open-ended, ongoing
content work by design (ADR-004) — there is no "done" for it to reach.

## 2026-08-14 — M6 (admin + First Session) code-complete

Added `supabase/migrations/0010_admin.sql` (additive admin cross-account read policies on
`accounts`/`learner_profiles`/`bookings`/`purchases`/`credit_ledger` — RLS OR's them with the
existing owner-scoped policies, nothing removed; `refund_credit` RPC, admin-gated + audited).
Added `src/lib/admin/*` (a `requireAdmin()` guard every action starts with) and the `/admin/*`
surfaces: availability editor, bookings calendar with a missing-Meet-link queue (INV-BOOK-2's
admin-facing half), credit-return approve/deny queue, user list, question CRUD (writes through the
service-role client after the admin check, since `questions`' column-privilege wall is deliberately
not something an RLS policy should punch through). Added `0011_sms_worklist.sql` closing a spec gap
found here: REQ-ADMIN-004 needs "the recipient's number" but no phone field existed anywhere in
`07_DATA_MODEL` — added an optional `accounts.phone`, buyer-settable on `/profiles`; `/admin/reminders`
is the worklist itself (soonest-first, "3h 20m" formatting, a `sms_sent` flag the admin controls,
not the system).

Added `src/lib/assessment/probe.ts` (TASK-FIRST-003) — the probe-and-descend engine, deliberately
stateless/replay-based (`nextProbe(history, ...)` recomputes the walk from `assessment_items` every
call, since a web request can't hold a generator between "ask" and "answer") so it doubles as a pure
function testable over a fixture prerequisite graph with no database. Six tests cover a strong
student finishing in ~3 questions, a cascading gap located by descent, the cap never exceeded on a
30-node chain, and resumability. Added `0012_test_prep.sql` (TASK-FIRST-004 — `practice_tests`/
`test_prep_questions`, deliberately not the `questions` table, since test-prep sets aren't tied to a
lesson slug and reusing it would break the lesson-slug integrity guard) and `src/lib/assessment/
test-prep.ts`.

Added `0013_first_session.sql` (TASK-FIRST-001 — `assessments`/`assessment_items`; `book_first_session`,
a separate RPC from `book_session` because the $49 purchase is a flat fee, not a spendable credit —
it must never call `spend_credit`) and `src/lib/assessment/{first-session,session}.ts` + the
`/first-session` page: routes by the goal stated at purchase (`class_help` straight to booking,
`strengths` through the probe engine wired to real questions — auto-skipping nodes with no authored
content yet, `test_prep` through a chosen fixed set), closing a second spec gap
(`assessments.test_slug`, since ADR-005 named the `test_prep` goal but not which test).

Added `0014_session_notes.sql` + `src/lib/assessment/plan.ts` (TASK-FIRST-002 — the written-plan
renderer, pure, works from session notes alone when there's no assessment) and the
`/admin/bookings/[id]` plan page (notes editor + live preview).

181 tests passing (up from 134 at the end of M5), `next build` clean, 46 routes. **Not
live-verified** — same limitation as M3–M5. Checklist added to `VERIFY.md` §4.

## 2026-08-14 — M5 (progress + booking, critical path) code-complete

Added `supabase/migrations/0005_progress.sql` (`question_attempts`/`lesson_progress`, RLS scoped
through `learner_profiles` ownership) and wired attempt recording into `checkAnswer` via the active
profile cookie — anonymous practice still records nothing (ADR-004). Added
`0006_availability.sql` (recurring weekly template + one-off exceptions, admin-write/
authenticated-read) and `src/lib/booking/{timezone,slots}.ts` — a from-scratch, dependency-free
DST-correct wall-clock↔UTC converter and slot generator, pure-logic tested including actual 2026
spring-forward/fall-back boundaries. Added `0007_bookings.sql` (`book_session` RPC: advisory-lock
keyed on the slot instant + a partial unique index as the DB-level backstop, INV-BOOK-1; trusts
`auth.uid()` internally rather than a caller-supplied account id). Added `0008_booking_lifecycle.sql`
(`cancel_booking`/`reschedule_booking` — the latter never touches the ledger, INV-MONEY intact;
`mark_no_show`/`resolve_credit_return_request`, admin-gated + `audit_log`-backed). Added
`src/lib/booking/calendar.ts` (Google Calendar + Meet — every Google call is wrapped so a failure
returns `null`/no-throw instead of breaking a committed booking, INV-BOOK-2, S10) and
`0009_notifications.sql` + `src/lib/notify/*` + `/api/cron/session-reminders` (Resend confirmation/
reminder/receipt emails; `reminded_24h`/`reminded_1h` flags flip only on a successful send, so a
cron rerun before a flag flips is the only way to double-send and a rerun after is a guaranteed
no-op). Added the `/book` page (slot picker grouped by the visitor's *browser* local date, booking
confirmation, upcoming/past list with cancel and no-show credit-return request). 134 tests passing
(up from 61 after M4) — SQL-text invariant tests per migration, pure-logic tests for slot
generation/DST/24h-4week windowing, and mocked-external-service tests for the Stripe/Google/Resend
call sites; `next build` clean. **Not live-verified** — same limitation as M3/M4, plus two new
external dependencies (Google, Resend) this environment can't reach. Checklist added to
`VERIFY.md` §3.

## 2026-08-14 — M4 (money): CREDIT-001, BILLING-001, BILLING-002 code-complete

Added `supabase/migrations/0004_credits.sql` (`purchases` with a partial unique index enforcing
≤1 First Session per account — INV-MONEY-2; append-only `credit_ledger` — INV-MONEY-1;
`stripe_events` idempotency guard — INV-MONEY-3; `get_balance()`, `spend_credit()` — advisory-lock
serialized so concurrent spends can't drive the balance negative — and `process_purchase()` RPCs).
Added `src/lib/credits/*` (balance/history reads), `src/lib/billing/*` (Stripe client,
`createCreditsCheckout`/`createFirstSessionCheckout` SAs — the latter pre-checks the one-per-
customer rule before hitting Stripe), `src/app/api/webhooks/stripe/route.ts` (signature-verified,
routes `checkout.session.completed` to `process_purchase`), and the `/wallet` page (balance,
purchase buttons, order history). Tests: SQL-text invariant checks for the migration
(`credits/integrity.test.ts`), input-validation short-circuits for both checkout SAs, and
webhook-route tests (signature rejection, unknown event passthrough, malformed metadata, happy
path) with `stripeClient`/`createAdminClient` mocked. `next build` clean; 61 tests passing.
**Not live-verified** — same limitation as AUTH-001/ACCT-001 (no Docker, and no Stripe test
account configured in this environment). Checklist added to `VERIFY.md` §2.

## 2026-08-14 — TASK-SPEC-004: rebuild the layered `docs/` tree

Built `docs/` as a navigation/narrative layer over `/spec` (L0 business, L1 context/actors/journey
catalog, L1′ invariants + traps, L2 one journey doc per `F1`–`F13` citing build status, L3 one
component doc per module that actually exists in `src/`). It does not duplicate `/spec` content —
`/spec` stays the single source of truth; this tree cites `REQ-*`/`F*`/`ADR-*` IDs instead of
restating them, and exists to make onboarding, refinement, and extension fast for a new reader.
Corrected two inaccuracies surfaced while writing it: the transitive-prerequisite-closure BFS used
for roadmap highlighting lives client-side in `skill-tree.tsx`, not in `layout.ts` as earlier docs
implied — F6's assessment will need it extracted to a pure function, not reused as-is. Updated
`STATUS.md` and `spec/13_COVERAGE_MATRIX.md`'s doc-tree notes to point at it. Last open paper task
before this; none remain.

## 2026-08-14 — spec cleanup: 06/08/09/10 were never rewritten against spec/14

`06_ARCHITECTURE.md`, `08_API_CONTRACTS.md`, and `09_FRONTEND.md` were marked DRAFT/LIGHT and
skipped by TASK-SPEC-003's rewrite pass (which covered 02–05, 07, 11, 13). They still carried v1
parent/dependent-consent language, a `payer`/`owner`/`student` role vocabulary that contradicts
`04_ACTORS.md`'s Buyer/Learner-profile/Admin-Tutor model, RPC parameter names that don't match
`07_DATA_MODEL.md` (`p_payer_id` vs the real `account_id`/`profile_id` columns), and a `FLOW-*` ID
scheme `05_FLOWS.md` replaced with plain `F1`–`F13`. Rewrote all three against spec/14 +
ADR-003/004/005; gave `10_BACKEND.md` the same terminology pass; corrected `00_README.md`'s ID
convention section to describe the real `F1`–`F13` scheme instead of `FLOW-<AREA>-NNN`. Also filled
two real gaps `08_API_CONTRACTS.md` had never covered: `rescheduleBooking`/`reschedule_booking` (F9)
and `resolveCreditReturnRequest` (F10). `spec/00`–`13` are now consistently current; before this,
only 8 of the 14 files actually were, despite `HANDOFF.md` claiming otherwise.

## 2026-08-14 — M3 build starts: pricing config, course nodes, auth, landing

- **TASK-CONFIG-001** — `src/lib/pricing.ts`, the single source for the First Session ($49) and
  the four credit packs (1/$75 · 2/$120 · 4/$200 · 8/$350), plus a Stripe price-id-per-SKU env
  mapping. `pricing.test.ts` asserts the numbers match spec/14 §11 exactly.
- **TASK-ROADMAP-002** — `roadmap/roadmap.json` nodes can now carry `course: true` (algebra,
  geometry, precalculus, calculus tagged); `buildTree` inherits a `courseId` down to every
  descendant, and `courses()` enumerates the picker choices for a learner's "current math class."
- **TASK-AUTH-001** — Google OAuth as a popup window (not a full-page redirect — Google blocks
  iframes, so `window.open` + a `postMessage`-and-close `/auth/callback?popup=1` page is the
  closest feasible thing to a modal), magic-link sign-in (`/login`), a shared `/auth/callback` code
  exchange, `signOut`, and `src/proxy.ts` (Next 16's session-refresh middleware) so cookies stay
  valid across requests. No passwords, no reset flow. **Not live-verified**: this environment has
  no Docker (no local Supabase stack) and no confirmed Google provider config on the linked
  project, so the OAuth round-trip and same-email identity linking are unexercised — verify against
  a running project before relying on them.
- **TASK-LAND-001** — `src/app/page.tsx` rebuilt with the approved hero copy verbatim from
  spec/14 §14 ("Math help, whatever you need it for", the three goal branches), prices read from
  `pricing.ts` rather than retyped, and the stale "45-minute session" line corrected to 60-minute
  (spec/14 §15). The primary CTA points at `/login` for now, not a checkout — BILLING-001/FIRST-001
  don't exist yet.
- **TASK-ACCT-001** — `supabase/migrations/0003_accounts.sql` adds `accounts` (auto-provisioned by a
  trigger on `auth.users`, so no signup step is needed) and `learner_profiles` beneath it — name,
  grade, current class, no credentials (INV-ACTOR-1). RLS scopes both to `auth.uid()`.
  `src/lib/accounts/*` adds profile CRUD and a cookie-based "active profile" switch; a profile's
  `currentCourseNode` is validated against `courses()` from ROADMAP-002. `/profiles` is a first
  account-management page, redirecting signed-out visitors to `/login`. Rewrote `08_API_CONTRACTS`'s
  stale Accounts section (leftover v1 parent/dependent-consent language) to match.

## 2026-08-14 — content is free; the paywall is cut (ADR-004)

- **The $19.99 course SKU is withdrawn.** All course content is free and public; two products remain
  (tutoring credits, $49 Math Diagnosis). Amends ADR-003 hours after it was accepted, before
  anything was built against it.
- **Why:** a paid course creates a **delivery obligation** — selling "Math up to Geometry" with most
  of the arc unauthored is under-delivery, which silently reinstated the constraint the empty-shelf
  plan existed to escape. And gating capped the indexable surface at 3–5 sample lessons while cold
  organic search *is* the acquisition channel. At $19.99 the forgone revenue is immaterial next to
  credit packs.
- **Lead capture moves to "sign in to save your progress"** (`TASK-PROGRESS-001`) — captures the
  email without hiding anything from crawlers.
- **Cut from scope:** entitlements table, gating, buy prompts, the course Stripe product, and the
  `sample: true` flag. Lesson pages stay **fully static**, preserving the SSG/KaTeX/CWV design.
- **CON6 is effectively restored** (free content is the funnel) — but with the whole catalog
  indexable rather than a handful of samples, and the roadmap skill tree as the differentiator.
- Authoring now **gates nothing**: a partial free catalog is honest, and every lesson added is new
  SEO surface. Trade-offs recorded in `adr/004-free-content.md`, including the one-way-door risk of
  charging later and the reliance on diagnosis → credit-pack conversion.

## 2026-08-14 — pricing + operations decided (ADR-003)

- **Every open decision closed.** Course **$19.99** (one SKU for the whole course) · Math Diagnosis
  **$49** (deliberate tripwire) · credits **1/$75 · 2/$120 · 4/$200 · 8/$350**. Closes **D2/OQ1**.
  Recorded in `spec/14` §11 and `adr/003-v3-product-model.md`.
- **Consequence made explicit:** with content and diagnosis both priced as tripwires, **credit packs
  carry essentially all revenue** — so credits+booking is the critical path and the paywall is lead
  capture, not a revenue line.
- **Operations decided:** solo tutor (no tutor entity) · recurring weekly availability + exceptions ·
  slots stored **UTC**, shown in browser TZ · Meet link per booking via Calendar API, created
  **after** the booking commits so a Google outage can't lose a booking · **Resend** transactional
  email · **Google OAuth + magic link**, no passwords · no self-serve refunds (manual Stripe paired
  with an admin ledger adjustment) · samples via `sample: true` frontmatter · **apex domain** cutover
  (closes **OQ3**).
- **v1 ships the paywall over an empty shelf** — course content is authored *after* launch, making
  authoring pure content work with no code change.
- **`spec/12_IMPLEMENTATION_PLAN.md` rewritten** against all of the above: M2 (close out the pivot)
  → M3 accounts → M4 money → M5 booking → M6 admin+diagnosis → M7 launch. No open blockers.
  CON3/OQ2 (consent) is deferred, not resolved.

## 2026-08-14 — v3 ground truth + the public roadmap map

- **Ground truth re-decided** (`spec/14_GROUND_TRUTH_INTERVIEW.md`). Content becomes a **one-time
  paid purchase per course**; public = the roadmap plus 3–5 sample lessons. Three products (course ·
  credits · **Math Diagnosis** SKU). Sessions **60 min**. One buyer login with **learner profiles**
  (no child credentials, so no consent gate at launch). Credits never expire; 24h free cancel;
  Meet link per booking; email-only notifications with a manual **admin SMS reminder queue**.
  Supersedes the free-content premise and the 45-minute credit unit in `spec/01_PRD.md`.
- **`docs/` archived** to `docs/archive/v1-sat/` (it described the frozen v1 SAT model). `CLAUDE.md`
  now points at spec/14.
- **`/roadmap` — the public skill-tree map.** Build-time layout (`src/lib/content/layout.ts`, pure)
  turns the curriculum into positioned nodes plus two visually distinct edge kinds: solid
  **containment** and dashed gold **prerequisites**. Regions are laid out as **clusters packed into
  rows**, and any region too wide to read is split into its sub-concepts — which took the map from a
  8652×980 strip (ratio 8.8) to 3320×2082 (ratio 1.6) and keeps it screen-shaped as the curriculum
  grows. Client component pans, zooms, and on select dims everything outside the node's transitive
  prerequisite chain. Phones get the same data as a `<details>` outline (`outline.tsx`), since a tree
  is unreadable at that width.
- **`status: "planned"`** added to the roadmap schema and inherited by descendants; Algebra,
  Geometry, Pre-Calculus, and Calculus are seeded as locked regions so the full arc is visible.
- Verified: 30 tests pass (9 new layout tests — overlap, region packing, containment, orphan
  prereqs), lint clean, `next build` clean with `/roadmap` prerendered static.

## 2026-07-11 — M1: practice questions (TASK-PRACTICE-001)

- **Questions schema + answer secrecy.** Migration `0002_questions.sql`: `questions` table keyed to
  in-repo lessons by `lesson_slug` (ADR-001), with per-type shape constraints (mcq/numeric/free).
  Rows are world-readable, but **column-level grants** withhold `answer`/`tolerance`/`explanation`
  from the `anon`/`authenticated` roles — the auto-check secret is readable only by trusted server
  code via the service role, so it never reaches the client (AT-PRACTICE-005). `supabase/seed.sql`
  seeds 5 questions across the two Geometry lessons.
- **Answer-checking (`src/lib/practice/*`).** Pure `checkSubmission` — mcq exact-match, numeric
  equality within tolerance, free-response reveal (no grade); non-numeric input throws
  `MalformedSubmissionError` (REQ-PRACTICE-003). `getLessonQuestions` reads presentational columns
  via a cookieless anon client (safe in static generation; returns `[]` on error so lessons still
  render). `checkAnswer` server action reads the full row via the service role, checks, and returns
  a discriminated `{ ok, isCorrect, explanation } | { ok:false, code, message }`. Anonymous in M1 —
  no attempt recorded (that's TASK-PROGRESS-001).
- **UI.** Interactive `PracticeQuestions` client component under each lesson: MCQ radios, numeric
  input with inline validation, free-response reveal; accessible (fieldset/legend, aria-live), navy/
  gold styling.
- **Verification.** 10 new tests (pure checking ×7; answer-secrecy grant + slug-integrity ×3).
  Against a local Supabase stack: anon is denied the `answer` column (HTTP 401) while service role
  reads it; served lesson HTML shows prompts/choices with no answer/explanation leaked. `next build`
  clean and degrades gracefully when the table is absent. **Follow-up:** migration 0002 + seed still
  need applying to the remote Supabase projects (see STATUS) — verified locally only.
- **Docs.** Updated `08_API_CONTRACTS` (checkAnswer return shape + M1 anonymous scope) and
  `13_COVERAGE_MATRIX`.

## 2026-07-10 — M1: content pipeline (TASK-CONTENT-001)

- **MDX + KaTeX pipeline + Learning Path.** Added `src/lib/content/*`: a filesystem-driven catalog
  builder (`getCatalog/getCourse/getTheme/getLesson/...`) that reads in-repo MDX + `_meta.json`
  into an ordered Course→Theme→Lesson tree (ADR-001), validating slug uniqueness and
  slug/filename match at build; and a server-side MDX renderer (`@mdx-js/mdx` + `remark-math` +
  `rehype-katex`) that emits math as static HTML — no client JS for primary content
  (NFR-PERF-001).
- **Routes (all SSG/SSR, public).** `src/app/(content)/courses` catalog, `/courses/[course]`
  themes+lessons, `/courses/[course]/[theme]/[lesson]` lesson with prev/next path navigation;
  shared `(content)/layout.tsx`. Global `not-found.tsx` returns 404 with links back into the
  Learning Path (AT-CONTENT-002).
- **SEO (NFR-PERF-003).** Per-page title/description/canonical metadata + `metadataBase`;
  `sitemap.ts` (landing, catalog, every course + lesson) and `robots.ts`; semantic-heading lesson
  prose styling.
- **Seed content.** A real 2-lesson Geometry slice (`content/geometry/foundations/*`) to prove the
  pipeline end-to-end; the full slice is authored in TASK-CONTENT-002.
- **Verification.** 10 unit/integration tests (`content.test.tsx`); `next build` clean with content
  pages prerendered; served HTML confirmed to carry prose + KaTeX + SEO metadata; unknown slug →
  404. **Open:** NFR-PERF-002 Lighthouse lab run pending a deployed preview (met structurally).
- **Docs.** Recorded the course/theme `_meta.json` metadata convention as an ADR-001 follow-up;
  updated `13_COVERAGE_MATRIX.md`.

## 2026-07-10 — M0 scaffold

- **TASK-PROJECT-001 (app scaffold) done.** Cleared the entire v1 SAT app from `main` (v1
  preserved on the `v1-sat` branch): removed `src/app/(auth|dashboard)`, `src/app/api`,
  `src/app/{book,offerings}`, `src/components`, `src/lib`, `src/middleware.ts`, `src/__tests__`,
  and all 92 `supabase/migrations`. Rebuilt a clean v2 base: navy/gold + Inter design tokens
  ported into `globals.css` (SAT-landing-only CSS dropped), v2 metadata, minimal `SiteNav`, and a
  v2 landing (`/`) reflecting the PRD positioning (free ground-up math path + optional 1:1).
  Removed the v1 `ignoreBuildErrors` escape hatch so the build type-checks under `strict`.
  Verified: `next build` clean; prod server serves the landing (HTTP 200, design tokens present).
- **TASK-PROJECT-002 (Supabase wiring) done.** Ported the three Supabase clients
  (`src/lib/supabase/{server,client,admin}.ts`), added the schema baseline
  `supabase/migrations/0001_init.sql` (pgcrypto only; feature tables land per later task), created
  the `content/` directory. Env documented in `.env.local.example`; connectivity verified against
  the live Supabase project (`auth/v1/settings` → 200). **M0 complete.**

## 2026-07-10

- Started Provable Learning **v2** under a spec-driven workflow. Established `/spec` system:
  `00_README` (workflow rules + conflict authority + ID scheme), `01_PRD` (drafted), `02_GLOSSARY`.
- Added root `AGENTS.md` (agent operating rules), `STATUS.md` (resume-first state).
- PRD decisions locked: launch = free content + credit packs + 1:1 booking; accounts =
  parent-managed children **and** standalone adults; parent owns wallet & books for a child;
  children have their own logins; solo tutor = admin; AI tutor and group lectures out of launch
  (group lectures = named future capability); success = ship-quality/correctness gate; course
  roadmap = Geometry → Pre-Calc → Calculus; minors = parent-consent gate (detail deferred to
  auth ADR).
- Business-truth review (Lavish) refined the PRD: acquisition channel = cold organic search
  (new CON6, SEO as NFR-PERF concern); product wedge = curated structured Learning Path;
  positioning around math-anxious/beginner/supplementary/depth personas; adopted
  Dependent/Independent Student + Parent actor vocabulary (retired "Learner").
- Stage 2: wrote `spec/03_REQUIREMENTS.md` (40 `REQ-*`/`NFR-*` across 9 functional + 4 NFR
  areas). Resolved decisions: free-response = self-checked (D1); refunds admin-only (D3);
  cancel ≥24h → credit back, <24h forfeit (D4); Google Calendar + Meet per session (D5); email
  reminders 24h+1h, no SMS (D6). D2 (pack tiers) deferred to billing.
- Stages 3–4: wrote `spec/04_ACTORS.md` (Visitor, Independent/Dependent Student, Parent,
  Admin-Tutor + external systems + capability matrix) and `spec/05_FLOWS.md` (core launch arcs
  with explicit failure/concurrency paths for billing & booking).
- Stage 5: locked architecture forks — hybrid content model (**ADR-001**: MDX-in-repo +
  questions-in-DB), fresh app porting v1 modules, Next+Supabase SSR, single repo. Wrote
  `spec/06_ARCHITECTURE.md` (modules, trust boundaries, critical-path flows, failure boundaries)
  and `spec/07_DATA_MODEL.md` (entities, RLS, INV-1..7 invariants, RPC transaction boundaries).
- Stage 6: completed the spec tree — `08_API_CONTRACTS` (SA/RH/RPC contracts, error model),
  `11_ACCEPTANCE_TESTS` (AT-* Given/When/Then covering S1–S8, incl. concurrency/idempotency),
  `12_IMPLEMENTATION_PLAN` (M0–M5 TASK-* with DoD + dependency order), `13_COVERAGE_MATRIX`
  (requirement→flow→design→task→test trace), and light `09_FRONTEND`/`10_BACKEND`.
  **Specification phase complete; ready for implementation at M0.** Open blockers: ADR-002
  (before M2), D2 pack tiers (before BILLING-001).
