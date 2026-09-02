# F2 — Explore the roadmap

**Actor:** Visitor · **Status:** ✅ built

## Trigger

Opens `/roadmap`.

## Steps

1. Sees the full K–12 arc rendered as a pan/zoom skill tree; unbuilt regions are visibly locked,
   never absent.
2. Pans/zooms (desktop) or expands a nested outline (mobile — same data, different interaction).
3. Selects a node → a detail panel shows description, prerequisites, and a link to the lesson; the
   node's **transitive prerequisite chain** highlights on the map.
4. Selecting an unbuilt node shows "coming soon", never a 404.

## Why it matters structurally

**This is the wedge, not the content.** The roadmap is what differentiates the product from
content-richer, map-less competitors (`00-business.md`). The "highlight everything this node
transitively depends on" BFS that lights up the prerequisite chain lives client-side in
`src/components/roadmap/skill-tree.tsx` (walks each node's direct `prereqs` outward). F6's
assessment needs the same transitive-closure logic server-side to walk the probe order — see
`components/content-pipeline.md` and `components/roadmap-viewer.md` for the current split, and
`journeys/f6-assessment.md` for why that logic isn't reusable as-is yet.

## Guards / invariants

None money/identity-related — this is a pure read path, same as F1: no branch on auth state.

## Failure paths

- Node references a lesson slug that doesn't exist → build-time slug-integrity check fails (not a
  runtime failure) — see `components/content-pipeline.md`.

## Requirements / tests

`REQ-ROADMAP-001..006` · `AT-ROADMAP-001..004`.

## Components

`components/roadmap-viewer.md`, `components/content-pipeline.md` (for node/lesson data).
