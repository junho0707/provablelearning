# Content pipeline

**Code:** `src/lib/content/roadmap.ts`, `catalog.ts`, `layout.ts`, `mdx.tsx`, `types.ts` ·
`src/app/(content)/**` · **Serves:** F1, F2 · **Status:** ✅ built

## What it does

Turns `roadmap/roadmap.json` (structure, ADR-002) + `content/*.mdx` (prose) into rendered,
statically-generated lesson and course pages, plus the data the roadmap UI lays out and draws.

## How it fits together

```
roadmap/roadmap.json ──► roadmap.ts (index + tree)
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
            catalog.ts            layout.ts
      (join tree + MDX bodies)  (pure visual layout:
                    │             positions + edges)
                    ▼                   │
          src/app/(content)/**          ▼
          (lesson/course pages)  components/roadmap/*
                                  (pan/zoom UI)
```

- **`roadmap.ts`** — reads and indexes `roadmap.json`: builds parent/child maps, validates no
  node points at a missing parent, computes sibling order (a lesson sorts by `number`; a concept
  sorts by its lowest-numbered descendant). Throws at build/boot time on a malformed roadmap —
  never a broken runtime page. Also exposes `courses()` (every `course: true` node, for the "current
  math class" picker, ADR-005) and `lessonNode`/`lessonTrail`/`neighbors` for page routing.
- **`catalog.ts`** — the public content API. Joins the structural tree to `content/<slug>.mdx`
  bodies. `hasContent(slug)` distinguishes an authored lesson from a scaffolded stub (checks for
  the `TODO: write this lesson` marker) — this is what lets the roadmap show "coming soon" instead
  of a broken link for unauthored nodes. Bodies are read fresh per call (cheap; dev edits show up
  without a restart).
- **`layout.ts`** — pure, deterministic skill-tree layout: turns the curriculum tree into
  positioned nodes (`LaidOutNode`) and two kinds of edge — **branch** (containment, solid) and
  **prereq** (must-learn-before, dashed, drawn crossing branches). No DOM, no measurement — computed
  once, shipped as data; the client only pans/zooms/highlights. Also splits an overly-wide region
  into sub-clusters (`islandsOf`) so the map stays roughly screen-shaped as the curriculum grows.
- **`mdx.tsx`** — server-renders lesson MDX with KaTeX.

## What depends on it

- `src/app/(content)/courses/**` (lesson/course pages, F1), `sitemap.ts`/`robots.ts`.
- `src/app/roadmap/page.tsx` and `components/roadmap/*` (F2) — consume `layout.ts`'s output.
- Planned: F6's assessment needs a transitive-prerequisite-closure traversal. That traversal exists
  today only client-side in `src/components/roadmap/skill-tree.tsx` (see `roadmap-viewer.md`) — it
  is **not yet** a pure function here, despite `roadmap.json`'s `prereqs` field living in this
  module. Extracting it here is the natural place per the current build plan (`STATUS.md`).

## Invariants it upholds

- No content route requires an account (ADR-004) — access is identical for every visitor; only
  recording differs (F4). `AT-CONTENT-005` is the guard test for this and is still unwritten
  (`spec/13_COVERAGE_MATRIX.md`).
- Slug integrity: every roadmap node reference resolves, checked at build time.
