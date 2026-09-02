# F4 — Saved progress

**Actor:** Buyer · **Status:** 🟡 code-complete, not live-verified (`TASK-PROGRESS-001`)

## Trigger

Signed in, with an active learner profile selected, attempts a practice question.

## Steps

1. Each attempt is recorded against the **active profile** (not the account — a buyer with multiple
   profiles needs per-child progress).
2. A lesson flips to **complete only when every one of its practice questions has been answered
   correctly** — partial correctness doesn't complete it.
3. Switching the active profile switches the progress view. Progress persists across sessions.

## Why it matters structurally

This is the **only** thing that differs between Visitor and Buyer on a content page — access is
identical (F1). Recording is the entire value of signing in for content purposes; it must not leak
into gating anything, or it silently reintroduces the paywall ADR-004 removed.

## Guards / invariants

- Anonymous attempts (F1) write nothing — recording only happens signed-in, which is what keeps the
  anonymous path static.
- `lesson_progress` PK is `(profile_id, lesson_slug)` — completion is per profile, not per account.

## Failure paths

- Attempt recorded but the account has zero profiles somehow → should not be reachable; profile
  creation is forced on first sign-in (F3).

## Requirements / tests

`REQ-PROGRESS-001..003` · `AT-PROGRESS-001..002`.

## Components

Not yet built. Will extend `components/practice.md` (the checking logic already exists; this adds
the write path) and depend on `components/accounts.md` for the active profile.
