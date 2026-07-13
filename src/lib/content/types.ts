import { z } from "zod";

/**
 * Content model (ADR-001, amended by ADR-002): the curriculum **structure** — the tree of
 * concepts and lessons, their titles, ordering, and prerequisites — is authored once in
 * `roadmap/roadmap.json` (the single source of truth). Lesson **prose** lives in flat in-repo MDX
 * files at `content/<node-id>.mdx`, joined to the roadmap by the node `id`. Practice questions live
 * in the DB, joined by the same id (used as the lesson `slug`).
 */

/** One node in `roadmap/roadmap.json`. A node is a *lesson* when it has a `number`; else a *concept* (container, no page). */
export const roadmapNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.literal("concept").optional(),
  number: z.union([z.string(), z.number()]).optional(),
  role: z.enum(["core", "application"]).optional(),
  strand: z.string().optional(),
  /** Container id, or an array for a *bridge* node that belongs to two branches. Absent for a root. */
  parent: z.union([z.string(), z.array(z.string())]).optional(),
  prereqs: z.array(z.string()).optional(),
});
export type RoadmapNode = z.infer<typeof roadmapNodeSchema>;

export const roadmapFileSchema = z.object({
  meta: z.record(z.string(), z.unknown()).optional(),
  nodes: z.array(roadmapNodeSchema),
});

/** Optional frontmatter on a lesson `.mdx` file. All structure comes from the roadmap; only `summary` is content-side. */
export const lessonFrontmatterSchema = z
  .object({ summary: z.string().optional() })
  .passthrough();

/** A node rendered into the navigable tree (index page, breadcrumbs). */
export type TreeNode = {
  id: string;
  title: string;
  kind: "concept" | "lesson";
  role: "core" | "application";
  number: number | null;
  /** Lessons only: true once the MDX file holds real prose (not a scaffolded stub). */
  hasContent: boolean;
  children: TreeNode[];
};

/** A lesson's metadata within the Learning Path (no MDX body). `slug` is the roadmap node `id`. */
export type LessonMeta = {
  slug: string;
  title: string;
  number: number | null;
  role: "core" | "application";
  summary?: string;
};

/** A lesson including its raw MDX body, ready to render. */
export type Lesson = LessonMeta & {
  body: string;
  hasContent: boolean;
};
