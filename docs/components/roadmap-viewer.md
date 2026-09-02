# Roadmap viewer

**Code:** `src/components/roadmap/skill-tree.tsx`, `outline.tsx` · `src/app/roadmap/page.tsx` ·
**Serves:** F2 · **Status:** ✅ built

## What it does

Renders the laid-out curriculum (`components/content-pipeline.md` → `layout.ts`) as an interactive
pan/zoom skill tree (`skill-tree.tsx`) on desktop, and a collapsible nested outline (`outline.tsx`)
on mobile — same underlying data, two interaction models.

## Prerequisite highlighting

`skill-tree.tsx` holds a small BFS: given a selected node, it walks outward over each node's
`prereqs` list (queue-based, breadth-first) to find "the selected node plus everything it
transitively depends on," then dims everything else. This is the **only place in the codebase
today** that computes a transitive prerequisite closure — it is UI-only (client component, runs on
click), not a shared library function.

**Why this matters beyond the roadmap:** F6 (the strengths & weaknesses assessment) needs the same
closure computation server-side, to decide probe order. It cannot import this component (it's
client-side React); the closure logic needs extracting into a pure function first — see
`components/content-pipeline.md` and `journeys/f6-assessment.md`.

## Behavior

- Selecting a node opens a detail panel: description, prerequisites, link to the lesson.
- An unbuilt node (`hasContent: false`) shows "coming soon," never a 404 or dead link.
- Mobile falls back to `outline.tsx` — a nested, expandable list rendering the same tree, no
  pan/zoom gestures.

## Invariants it upholds

None money/identity-related — pure read path, same access for every visitor (F2).
