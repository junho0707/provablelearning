import fs from "node:fs";
import path from "node:path";
import { roadmapFileSchema, type RoadmapNode, type TreeNode } from "./types";

/**
 * Reads and indexes `roadmap/roadmap.json` — the single source of truth for curriculum structure
 * (ADR-002). Pure structure: no MDX bodies are read here (that's `catalog.ts`). A malformed roadmap,
 * a parent pointing at a missing node, or a prereq/parent cycle throws here, surfacing as a
 * build/boot error rather than a broken page.
 */

const ROADMAP_PATH = path.join(process.cwd(), "roadmap", "roadmap.json");

type Indexed = {
  nodes: RoadmapNode[];
  byId: Map<string, RoadmapNode>;
  childrenOf: Map<string, string[]>; // parent id -> child ids, in roadmap.json order
  roots: string[];
};

// Structure is immutable for the life of a production process, so memoize. In dev we re-read every
// call so edits to roadmap.json show up on reload without a server restart.
let cache: Indexed | null = null;

function parentsOf(n: RoadmapNode): string[] {
  if (!n.parent) return [];
  return Array.isArray(n.parent) ? n.parent : [n.parent];
}

export function isLesson(n: RoadmapNode): boolean {
  return n.number != null;
}

export function nodeNumber(n: RoadmapNode): number | null {
  if (n.number == null) return null;
  const v = typeof n.number === "number" ? n.number : parseInt(n.number, 10);
  return Number.isFinite(v) ? v : null;
}

function index(): Indexed {
  if (cache && process.env.NODE_ENV === "production") return cache;

  const parsed = roadmapFileSchema.safeParse(JSON.parse(fs.readFileSync(ROADMAP_PATH, "utf8")));
  if (!parsed.success) throw new Error(`Invalid roadmap.json: ${parsed.error.message}`);
  const nodes = parsed.data.nodes;

  const byId = new Map<string, RoadmapNode>();
  for (const n of nodes) {
    if (byId.has(n.id)) throw new Error(`Duplicate roadmap node id "${n.id}"`);
    byId.set(n.id, n);
  }

  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];
  for (const n of nodes) {
    const ps = parentsOf(n);
    if (ps.length === 0) roots.push(n.id);
    for (const p of ps) {
      if (!byId.has(p)) throw new Error(`Node "${n.id}" has unknown parent "${p}"`);
      childrenOf.set(p, [...(childrenOf.get(p) ?? []), n.id]);
    }
  }

  cache = { nodes, byId, childrenOf, roots };
  return cache;
}

/**
 * Sort key for a node among its siblings. Lessons sort by their `number`; a concept sorts by the
 * smallest lesson number beneath it, so a container lands where its first lesson would. The `seen`
 * guard makes a malformed parent cycle terminate instead of recursing forever.
 */
function orderKey(id: string, r: Indexed, seen = new Set<string>()): number {
  if (seen.has(id)) return Number.MAX_SAFE_INTEGER;
  seen.add(id);
  const n = r.byId.get(id)!;
  const own = nodeNumber(n);
  const children = r.childrenOf.get(id) ?? [];
  const childMin = children.length
    ? Math.min(...children.map((c) => orderKey(c, r, seen)))
    : Number.MAX_SAFE_INTEGER;
  return own != null ? Math.min(own, childMin) : childMin;
}

/**
 * The full curriculum as a nested tree of roots → concepts → lessons, siblings in curriculum order.
 * `hasContent(id)` annotates each lesson (default: unknown/false); `catalog.ts` supplies the real
 * check. A bridge node (two parents) intentionally appears under both — mirroring the map.
 */
export function buildTree(hasContent: (id: string) => boolean = () => false): TreeNode[] {
  const r = index();
  const toNode = (id: string, plannedAbove: boolean, courseAbove: string | null): TreeNode => {
    const n = r.byId.get(id)!;
    const lesson = isLesson(n);
    const planned = plannedAbove || n.status === "planned";
    const courseId = n.course ? id : courseAbove;
    const children = [...(r.childrenOf.get(id) ?? [])].sort((a, b) => orderKey(a, r) - orderKey(b, r));
    return {
      id,
      title: n.title,
      kind: lesson ? "lesson" : "concept",
      role: n.role ?? "core",
      number: nodeNumber(n),
      hasContent: lesson ? hasContent(id) : false,
      planned,
      prereqs: n.prereqs ?? [],
      courseId,
      children: children.map((c) => toNode(c, planned, courseId)),
    };
  };
  return [...r.roots].sort((a, b) => orderKey(a, r) - orderKey(b, r)).map((id) => toNode(id, false, null));
}

/** Every node marked `course: true`, in roadmap order — the choices for a "current math class" picker (ADR-005). */
export function courses(): { id: string; title: string }[] {
  return index()
    .nodes.filter((n) => n.course === true)
    .map((n) => ({ id: n.id, title: n.title }));
}

/** Every lesson node, deduped and sorted by `number` — the linear Learning Path. */
export function orderedLessonNodes(): RoadmapNode[] {
  return index()
    .nodes.filter(isLesson)
    .sort((a, b) => (nodeNumber(a) ?? 0) - (nodeNumber(b) ?? 0));
}

/** The roadmap node for a lesson slug, or null if the slug is unknown or names a concept (no page). */
export function lessonNode(slug: string): RoadmapNode | null {
  const n = index().byId.get(slug);
  return n && isLesson(n) ? n : null;
}

/** Any roadmap node by id — lesson or concept — or null if unknown. Unlike `lessonNode`, doesn't require a page. */
export function roadmapNode(id: string): RoadmapNode | null {
  return index().byId.get(id) ?? null;
}

/** Breadcrumb trail root → … → self, following the first parent at each step. */
export function lessonTrail(slug: string): { id: string; title: string; isLesson: boolean }[] {
  const r = index();
  const trail: { id: string; title: string; isLesson: boolean }[] = [];
  const guard = new Set<string>();
  let cur = r.byId.get(slug);
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    trail.unshift({ id: cur.id, title: cur.title, isLesson: isLesson(cur) });
    cur = r.byId.get(parentsOf(cur)[0] ?? "");
  }
  return trail;
}

/** Previous/next lessons around a slug in `number` order (in-lesson navigation). */
export function neighbors(slug: string): { prev: RoadmapNode | null; next: RoadmapNode | null } {
  const ordered = orderedLessonNodes();
  const i = ordered.findIndex((n) => n.id === slug);
  if (i === -1) return { prev: null, next: null };
  return { prev: ordered[i - 1] ?? null, next: ordered[i + 1] ?? null };
}
