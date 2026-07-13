# ADR-002 — Roadmap-driven content structure

- **Status:** Accepted (2026-07-12)
- **Deciders:** Owner (Admin-Tutor), agent
- **Related:** ADR-001 (hybrid content model — amends its content-tree conventions), REQ-CONTENT-001..002
- **Supersedes:** the "Content-tree conventions" section of ADR-001 (folder-based course/theme/lesson layout + `_meta.json`)

## Context

The curriculum is authored as a hand-built map in `roadmap/roadmap.json` (the roadmap viewer),
where concepts nest **arbitrarily deep** and lessons carry an explicit `number`, `role`, and
`prereqs`. ADR-001 stored structure a second way — as `content/<course>/<theme>/<lesson>.mdx`
folders plus `_meta.json` — capped at exactly three levels. That duplicated the hierarchy in two
places (map **and** folders) and couldn't represent the map's depth, so the two would drift.

## Decision

**`roadmap/roadmap.json` is the single source of truth for curriculum structure.** The app reads it
directly to build the navigable tree, ordering, breadcrumbs, and prev/next.

- A node is a **lesson** when it has a `number`; otherwise it is a **concept** (a container with no
  page of its own). Each concept's first lesson is its "Definition."
- Lesson **prose** lives in a **flat** file `content/<node-id>.mdx`. The node `id` is the lesson
  **slug** — the global join key to DB questions (unchanged from ADR-001).
- `_meta.json` files and the `title/slug/order` frontmatter are **gone**; that metadata now comes
  from the roadmap node. Lesson frontmatter is optional and holds only `summary`.
- Ordering: lessons by `number`; a concept sorts by the smallest lesson `number` beneath it.
- A lesson node with no file (or a scaffolded stub) renders as "coming soon" — it never 404s, so
  the map doubles as a visible authoring to-do list.

Structure lives in `src/lib/content/roadmap.ts`; the prose join + public API in `catalog.ts`.

## Authoring flow

1. Add/adjust nodes in `roadmap/roadmap.json` (via the viewer's editor or by hand).
2. `node scripts/scaffold-content.mjs` — creates a stub `content/<id>.mdx` for any new lesson.
3. Write the lesson prose in that file; add practice questions to `supabase/seed.sql` keyed by the
   same id.
4. `npm run dev` → the tree, the lesson page, and its practice section render live.

## Consequences

- **Positive:** one place to change structure; the map *is* the content index and to-do list;
  arbitrary nesting supported; flat content dir; no folder/`_meta` bookkeeping.
- **Trade-offs:** lesson URLs are flat (`/courses/<slug>`) rather than path-nested — fine because
  slugs are globally unique; breadcrumbs are reconstructed from the roadmap. A bridge node (two
  parents) appears under both branches in the tree, matching the map.
- The DB/question contract and the slug-as-join-key invariant from ADR-001 are unchanged.
