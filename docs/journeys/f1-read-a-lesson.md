# F1 — Read a lesson

**Actor:** Visitor (anonymous) · **Status:** ✅ built

## Trigger

Arrives from search or the roadmap.

## Steps

1. Requests a lesson URL. Next.js serves it statically (SSG) or SSR — content prose comes from
   in-repo MDX, rendered server-side with KaTeX.
2. Reads the lesson in full: prose, math, worked examples. Nothing is hidden or paywalled.
3. Attempts practice questions. Each submission is checked **server-side** (the answer never ships
   to the client) and returns correct/incorrect plus the explanation.
4. Nothing is recorded — anonymous attempts leave no trace. A "sign in to save your progress"
   prompt is offered but never blocks reading or attempting.

## Why it matters structurally

**There is no branch here for signed-in vs. anonymous access** — only *recording* differs (that's
F4). This is what keeps the page static: if access depended on auth state, the page couldn't be
prerendered. Read `docs/00-business.md` for why static+free is the whole acquisition strategy.

## Guards / invariants

- Answer secrecy (`02-invariants.md` → column-level grants): the client never receives `answer`,
  `tolerance`, or `explanation` columns directly; `checkAnswer` reads them server-side only.

## Failure paths

- Unbuilt lesson → global 404 with links back into the roadmap, never a broken page.
- `questions` table unreachable (e.g. migration not applied on a target DB) → page still renders,
  just with no questions — graceful degradation, not an error.

## Requirements / tests

`REQ-CONTENT-001..004` · `AT-CONTENT-001..004` (`AT-CONTENT-005`, the guard that no content route
requires an account, is written but not yet — see `spec/13_COVERAGE_MATRIX.md`).

## Components

`components/content-pipeline.md`, `components/practice.md`.
