# Content

Lesson prose lives here as **flat MDX files**, one per lesson: `content/<node-id>.mdx`.

Structure (the tree of concepts and lessons, their order, titles, and prerequisites) is **not**
here — it comes from `roadmap/roadmap.json`, the single source of truth (see
[ADR-002](../adr/002-roadmap-driven-content-structure.md)). The filename **is** the roadmap node
`id`, which is also the lesson slug and the DB question join key.

## Authoring a lesson

1. Add the lesson node to `roadmap/roadmap.json` (give it a `number` — that's what makes it a lesson
   rather than a concept container).
2. `node scripts/scaffold-content.mjs` — creates a stub `content/<id>.mdx` for any lesson missing one.
3. Replace the stub with the lesson. Format:

   ```mdx
   ---
   summary: One sentence — used for the page's meta description. Optional.
   ---

   Markdown prose. **bold**, _italic_, `## section headings`, lists.
   Inline math with `$...$`: the fraction $\frac{3}{4}$.
   Display math:

   $$
   \frac{4}{4} = 1
   $$
   ```

   Only `summary` is allowed in frontmatter — title/order/parent all come from the roadmap. Math is
   KaTeX, rendered to static HTML server-side. See `fractions-definition.mdx` for a full example.
4. (Optional) add practice questions to `supabase/seed.sql`, keyed by the same id.
5. `npm run dev` → open `/courses`, click the lesson.

A lesson node with only a stub (or no file) shows as **"coming soon"** in the tree and on its page —
so the map is a live to-do list. `npm run build` fails on a malformed roadmap or bad frontmatter.
