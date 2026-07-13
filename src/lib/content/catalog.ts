import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  buildTree,
  lessonNode,
  lessonTrail,
  neighbors,
  nodeNumber,
  orderedLessonNodes,
} from "./roadmap";
import { lessonFrontmatterSchema, type Lesson, type LessonMeta, type RoadmapNode, type TreeNode } from "./types";

/**
 * The public content API. Structure comes from the roadmap (`roadmap.ts`); this module joins it to
 * the lesson prose in `content/<slug>.mdx` (ADR-002). Bodies are read fresh each call — cheap, and
 * it means edits show up on reload in dev.
 */

const CONTENT_ROOT = path.join(process.cwd(), "content");
const STUB_MARKER = "TODO: write this lesson";

function lessonFile(slug: string): string {
  return path.join(CONTENT_ROOT, `${slug}.mdx`);
}

/** True once a lesson's MDX file exists and holds real prose (not a scaffolded stub or empty file). */
export function hasContent(slug: string): boolean {
  const file = lessonFile(slug);
  if (!fs.existsSync(file)) return false;
  const body = matter(fs.readFileSync(file, "utf8")).content.trim();
  return body.length > 0 && !body.includes(STUB_MARKER);
}

function toMeta(n: RoadmapNode, summary?: string): LessonMeta {
  return { slug: n.id, title: n.title, number: nodeNumber(n), role: n.role ?? "core", summary };
}

/** The full curriculum tree (roots → concepts → lessons), with lessons flagged by `hasContent`. */
export function getTree(): TreeNode[] {
  return buildTree(hasContent);
}

/** Every lesson in Learning-Path order (for static params, sitemap, neighbor lookup). */
export function getAllLessons(): LessonMeta[] {
  return orderedLessonNodes().map((n) => toMeta(n));
}

/** A lesson with its MDX body, ready to render. `null` for an unknown slug or a concept (drives 404). */
export function getLesson(slug: string): Lesson | null {
  const node = lessonNode(slug);
  if (!node) return null;
  const file = lessonFile(slug);
  const parsed = fs.existsSync(file)
    ? matter(fs.readFileSync(file, "utf8"))
    : { content: "", data: {} };
  const fm = lessonFrontmatterSchema.parse(parsed.data);
  return { ...toMeta(node, fm.summary), body: parsed.content, hasContent: hasContent(slug) };
}

/** Breadcrumb trail (root concept → … → this lesson) for a slug. */
export function getLessonTrail(slug: string) {
  return lessonTrail(slug);
}

/** The previous/next lessons around a lesson, in Learning-Path order. */
export function getLessonNeighbors(slug: string): { prev: LessonMeta | null; next: LessonMeta | null } {
  const { prev, next } = neighbors(slug);
  return { prev: prev ? toMeta(prev) : null, next: next ? toMeta(next) : null };
}
