# ADR-001 — Hybrid content model: MDX lessons in-repo, questions in the database

- **Status:** Accepted (2026-07-10)
- **Deciders:** Owner (Admin-Tutor), agent
- **Related:** REQ-CONTENT-001..005, REQ-PRACTICE-001, NFR-PERF-001..003, PRD §4 (Learning Path
  wedge), PRD CON6 (organic search)

## Context

v2's growth bet is cold organic search over a free, structured Learning Path (PRD §4, CON6), so
lesson pages must be server-rendered, crawlable, and fast. The operator is a solo, technical
person who is "mostly building" and for whom authoring effort is the #1 launch risk. Practice
questions, unlike prose, must be structured and queryable to support answer-checking, attempts,
and progress (REQ-PRACTICE, REQ-PROGRESS).

## Decision

Split content by nature:

- **Lesson prose (explanation + examples): MDX + KaTeX files in the repo**, under
  `content/<course>/<theme>/<lesson>.mdx`, with frontmatter (title, slug, order). Rendered as
  static/server-rendered pages. Git-versioned; no database read to display a lesson.
- **Practice questions: rows in Supabase**, keyed by the lesson's `slug`, carrying type, prompt,
  choices/answer, tolerance, explanation, and position.
- The `lesson slug` is the join key between the two: attempts and progress reference the slug
  (and question id), so structured data never duplicates the content tree.

## Alternatives considered

- **All in DB / CMS.** Lessons + questions in Supabase, edited via an admin UI. Enables
  non-technical authoring later, but is significant extra build now, loses git versioning, and
  makes fast static SEO pages harder. Rejected for launch (a solo technical author doesn't need
  it yet; can be added later without changing the question/attempt schema).
- **All MDX-in-repo (questions in frontmatter).** Simplest storage, but attempts/progress would
  reference file-defined question indices, making answer-checking rigid and analytics awkward.
  Rejected.

## Consequences

- **Positive:** fastest authoring loop for a technical solo (write a file); free, versioned,
  reviewable content; naturally static/SSR pages that satisfy NFR-PERF; questions stay
  structured for checking + progress.
- **Negative / trade-offs:** authoring requires a code editor + deploy (no non-technical CMS);
  the `slug` contract must be kept consistent between MDX frontmatter and question rows (a
  content-integrity check is warranted); adding a CMS later is a follow-on decision.
- **Follow-ups:** define the MDX frontmatter schema and a slug-integrity check at the content
  design stage (09/10); revisit a CMS only if a non-technical author joins.

> **Superseded by [ADR-002](002-roadmap-driven-content-structure.md) (2026-07-12).** The
> folder-based `content/<course>/<theme>/<lesson>.mdx` layout and `_meta.json` conventions below are
> replaced by a roadmap-driven structure: `roadmap/roadmap.json` is the single source of truth and
> lesson prose is flat `content/<node-id>.mdx`. The core decision above (MDX prose in-repo, questions
> in the DB, joined by the lesson slug) is unchanged.

## Content-tree conventions (resolved during TASK-CONTENT-001)

The decision above fixed *lesson* frontmatter but left Course/Theme display metadata and ordering
unspecified. Resolved as follows (does not change product behavior; recorded for consistency):

- **Layout:** `content/<course>/<theme>/<lesson>.mdx`. The **directory name is the slug** for a
  course/theme; the **lesson slug is its frontmatter `slug`** and MUST equal its filename.
- **Course/Theme metadata:** a `_meta.json` (`title`, `order`, optional `summary`) in each course
  and theme directory. Lesson frontmatter is `title`, `slug`, `order`, optional `summary`.
- **Ordering (REQ-CONTENT-002):** deterministic by `order` then slug at every level.
- **Slug uniqueness:** lesson slugs are the global DB join key and must be unique across the whole
  tree; the catalog build throws on a duplicate slug or a slug/filename mismatch (an early form of
  the slug-integrity check; the DB-side orphan check lands with TASK-PRACTICE-001).
