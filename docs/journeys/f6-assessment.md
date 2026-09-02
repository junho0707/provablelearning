# F6 — Strengths & weaknesses assessment

**Actor:** The learner, alone · **Status:** 🟡 code-complete, not live-verified (part of `TASK-FIRST-*`)

Set up by the buyer during F5 (`strengths` goal only); **completed by the student alone**
(`REQ-FIRST-005`) — this is deliberately not a parent-administered quiz.

## Trigger

First Session purchased with `goal = strengths`.

## Steps — "probe and descend"

1. Start from the learner profile's `current_course_node`; compute its **transitive prerequisite
   closure**. The same shape of traversal (BFS outward over `prereqs`) already exists today in
   `src/components/roadmap/skill-tree.tsx`, for lighting up the prereq chain in the UI (F2) — but
   it's a client component, so this journey needs the logic **extracted into a pure, server-callable
   function** (the plan in `STATUS.md` targets `src/lib/content/layout.ts` for this) rather than
   imported as-is.
2. **Probe** one question per major node in the closure, foundational nodes first.
3. **Correct** → mark that subtree solid, **skip it entirely**. This is what stops a strong student
   from answering forty easy questions they clearly know.
4. **Wrong** → **descend** into that node's prerequisites and probe again, recording `depth` (how
   far below the current class the descent went — this is what makes the written plan locatable:
   it names the floor).
5. Ask 2–3 questions at or near the learner's current class, regardless of the descent outcome.
6. Stop at the **~25-question cap**, or when the whole closure has been covered.
7. Results name the weak nodes; the operator arrives at the session already knowing them — no
   diagnosis happens live.

## Why it matters structurally

`class_help` mode has **no assessment at all**, not a shorter version of this one — see
`02-invariants.md`. Don't let this file's existence tempt you into building a trimmed variant for
that mode.

## Guards / invariants

- Copy rule: results are framed as strengths and next steps. No "diagnosis"/"behind"/"struggling"
  language in any assessment-facing copy.
- `assessment_items.depth` is required — it's not incidental telemetry, it's what the written plan
  is built from.

## Failure paths

- Learner abandons mid-assessment → partial `assessment_items` rows exist; the operator can still
  use what was probed, but the plan quality degrades gracefully rather than blocking the session.

## Requirements / tests

`REQ-FIRST-001..007` · `AT-FIRST-001..006`.

## Components

Not yet built. Will need the transitive-closure traversal extracted to a pure function (currently
only exists client-side in `components/roadmap-viewer.md`); assessment state itself is new.
