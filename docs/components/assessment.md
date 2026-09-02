# Assessment — First Session goal routing

**Code:** `src/lib/assessment/{probe,first-session,session,plan,test-prep}.ts` ·
`supabase/migrations/0012_test_prep.sql`, `0013_first_session.sql`, `0014_session_notes.sql` ·
`/first-session` page · **Serves:** F5 (buy the First Session), F6 (strengths & weaknesses
assessment) · **Status:** 🟡 code-complete, not live-verified

## What it does

Everything downstream of a First Session purchase: routes the buyer by their **stated goal**
(`ADR-005`), runs the probe-and-descend assessment for `strengths`, serves a fixed practice test for
`test_prep`, skips assessment entirely for `class_help`, books the session without spending a
credit, and renders the written plan the admin delivers afterward.

## Goal routing — the central invariant

| Goal | Pre-session step | Why |
|---|---|---|
| `strengths` | `probe.ts`'s engine, via `session.ts` | "Catching up / not sure where the gaps are" — a real assessment locates the floor. |
| `test_prep` | `test-prep.ts`'s hand-authored set | A fixed SAT/ACT-style test, not roadmap-derived. |
| `class_help` | **none** | A pre-test tells you nothing when the goal is already known — this is a deliberate absence, not an unfinished feature (`HANDOFF.md` traps). Don't "complete the pattern" by adding one. |

`first-session.ts`'s `getFirstSessionStatus` reads the buyer's `first_session` purchase and its
`goal` column (`billing.md`) — this is what `/first-session` uses to decide which of the three
branches to render.

## `probe.ts` — the probe-and-descend engine (`strengths` only)

Pure, stateless, **replay-based**: `nextProbe(history, currentNodeId, getPrereqs, cap)` recomputes
the entire traversal from the full `ProbeRecord[]` history on every call, rather than holding a
generator in memory — a web request can't keep server-side state between "ask a question" and "get
the answer," so the caller re-reads `assessment_items` and passes the full history back in each
time. This statelessness is also what makes it a **pure function**, directly unit-tested over a
fixture prerequisite graph with no database (`probe.test.ts`).

Traversal logic: starts at the learner's current class node (depth 0). A node's probes (3 if
depth ≤ 1, else 1 — "sparse at the bottom, dense near the student's level") are all pulled from the
history in order; if every probe at a node comes back correct, that branch is **solid** and descent
stops there — the learner isn't drilled on prerequisites of something already demonstrated. On any
wrong answer, the node is added to `floorNodeIds` and the walk **descends into that node's own
prereqs** (depth+1) to locate the true floor. Hits `ASSESSMENT_CAP` (25) as a hard stop. In practice,
`session.ts` documents that most of the roadmap is currently unauthored, so most probes hit a
no-content skip path rather than a real question (`STATUS.md`).

## `test-prep.ts`

`getPracticeTest(slug)` / `getTestPrepQuestions(slug)` — a **hand-authored, fixed, ordered** set per
test (`practice_tests`/`test_prep_questions`, migration `0012`), never generated from the roadmap
(`ADR-005` — `test_prep` names *which* test via `assessments.test_slug`). `checkTestPrepAnswer`
mirrors `practice.md`'s answer-secrecy shape exactly: reads the full row (incl. `answer`) via the
**admin client**, runs the same `checkSubmission` pure function, never returns the raw answer.

## `first-session.ts` — booking without spending a credit

`bookFirstSession` calls the `book_first_session` RPC (migration `0013`), a sibling of
`booking.md`'s `book_session` that reuses the same advisory-lock-on-slot-instant pattern but **never
calls `spend_credit`** — the $49 purchase itself is the payment, not a credit grant (`pricing.ts`:
First Session grants `0` spendable credits). `class_help` routes straight here; `strengths`/
`test_prep` land here once their pre-session step finishes. After the RPC commits: same
after-commit, best-effort `attachCalendarEvent` + `sendBookingConfirmationEmail` pattern as
`booking.md` (`INV-BOOK-2`).

## `plan.ts` — the written plan

`renderPlan` is pure (mirrors `probe.ts`'s testability). Must work from **session notes alone** when
`mode` is `class_help` (no assessment ever ran) — every other field is optional for exactly that
reason. For `strengths`, renders the `floorNodeIds` `nextProbe` located; for `test_prep`, names the
test; always includes session notes (or a "not added yet" placeholder). Assembled by
`admin.md`'s `getBookingPlan` (pulls `assessments`/`assessment_items` + `bookings.session_notes`)
and delivered by the admin within 48h (`REQ-FIRST-006/007`) — the system doesn't send this on its
own.

## Migrations

- **`0012_test_prep.sql`** — `practice_tests`, `test_prep_questions` (mirrors `questions`' shape).
- **`0013_first_session.sql`** — `assessments`, `assessment_items`, `book_first_session` RPC,
  `assessments.test_slug`.
- **`0014_session_notes.sql`** — `bookings.session_notes` + `set_session_notes` RPC
  (`admin.md`).

## What depends on it

`/first-session` page (goal-based routing UI), `admin.md`'s `getBookingPlan` (assembles plan
context), `billing.md`'s `createFirstSessionCheckout` (writes the `goal` this module reads).
