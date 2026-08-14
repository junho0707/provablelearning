import type { TreeNode } from "./types";

/**
 * Skill-tree layout: turns the curriculum tree into positioned nodes plus two kinds of edge.
 *
 * Pure and deterministic — no DOM, no measurement — so the whole map is computed at build time and
 * shipped as data. The client only pans, zooms, and highlights.
 *
 * Two relationships, drawn differently (the distinction `roadmap/README.md` insists on):
 * - **branch** — containment (`parent`). Solid line, the trunk of the tree.
 * - **prereq** — must-learn-before (`prereqs`). Dashed line, drawn on top, crossing branches.
 */

export const TREE = {
  lessonW: 208,
  lessonH: 72,
  conceptW: 176,
  conceptH: 48,
  gapX: 26,
  rowH: 132,
  padding: 64,
  /** Each top-level region is its own cluster; clusters wrap into rows so the map stays screen-shaped. */
  islandPad: 34,
  islandHeader: 38,
  islandGapX: 72,
  islandGapY: 86,
  /** Soft target width for a row of islands — a row wraps once adding the next island would exceed it. */
  rowWidth: 3200,
  /** A region wider than this is split into its sub-concepts, so no single cluster becomes a strip. */
  maxRegionWidth: 1500,
} as const;

export type LaidOutNode = {
  /** Unique per rendered instance. A bridge node (two parents) is drawn once per branch. */
  key: string;
  id: string;
  title: string;
  kind: "concept" | "lesson";
  role: "core" | "application";
  number: number | null;
  hasContent: boolean;
  planned: boolean;
  prereqs: string[];
  /** Ancestor titles, root first, excluding self — the breadcrumb shown in the detail panel. */
  trail: string[];
  depth: number;
  /** Centre point and box size, in layout space. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutEdge = {
  kind: "branch" | "prereq";
  from: string;
  to: string;
  /** SVG path `d`, in layout space. */
  d: string;
};

/** A top-level region of the curriculum, drawn as a bordered cluster with a title. */
export type Island = {
  id: string;
  title: string;
  planned: boolean;
  lessonCount: number;
  /** Cluster box in layout space, including padding and the header strip. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Layout = {
  nodes: LaidOutNode[];
  edges: LayoutEdge[];
  islands: Island[];
  /** Bounding box in layout space, already padded — feed straight into an SVG `viewBox`. */
  minX: number;
  minY: number;
  width: number;
  height: number;
};

function sizeOf(n: TreeNode): { w: number; h: number } {
  return n.kind === "lesson"
    ? { w: TREE.lessonW, h: TREE.lessonH }
    : { w: TREE.conceptW, h: TREE.conceptH };
}

/**
 * Tidy top-down tree placement. Children are packed left to right; a parent centres over its
 * children's span. When a node is wider than everything beneath it, its subtree is nudged right so
 * the node still fits in its own lane — this is what keeps a concept with a single child from
 * colliding with its neighbour.
 */
function place(roots: TreeNode[]): LaidOutNode[] {
  const out: LaidOutNode[] = [];
  const byKey = new Map<string, LaidOutNode>();
  let cursor = 0;

  const shift = (keys: string[], dx: number) => {
    for (const k of keys) byKey.get(k)!.x += dx;
  };

  /** Lays out `node`, returning its instance key, centre x, and every key in its subtree. */
  const walk = (
    node: TreeNode,
    depth: number,
    trail: string[],
    parentKey: string | null,
  ): { key: string; center: number; keys: string[] } => {
    const key = parentKey ? `${parentKey}/${node.id}` : node.id;
    const { w, h } = sizeOf(node);
    const subtree: string[] = [key];

    let center: number;
    if (node.children.length === 0) {
      center = cursor + w / 2;
      cursor += w + TREE.gapX;
    } else {
      const start = cursor;
      const kids = node.children.map((c) => walk(c, depth + 1, [...trail, node.title], key));
      for (const k of kids) subtree.push(...k.keys);
      const span = cursor - TREE.gapX - start;
      center = (kids[0].center + kids[kids.length - 1].center) / 2;

      // The node needs its own lane: if it is wider than its children's span, widen the span.
      if (w > span) {
        const dx = (w - span) / 2;
        shift(
          kids.flatMap((k) => k.keys),
          dx,
        );
        center += dx;
        cursor += w - span;
      }
    }

    const laid: LaidOutNode = {
      key,
      id: node.id,
      title: node.title,
      kind: node.kind,
      role: node.role,
      number: node.number,
      hasContent: node.hasContent,
      planned: node.planned,
      prereqs: node.prereqs,
      trail,
      depth,
      x: center,
      y: depth * TREE.rowH,
      w,
      h,
    };
    byKey.set(key, laid);
    out.push(laid);
    return { key, center, keys: subtree };
  };

  for (const r of roots) walk(r, 0, [], null);
  return out;
}

/** Vertical S-curve from a parent's bottom edge to a child's top edge. */
function branchPath(p: LaidOutNode, c: LaidOutNode): string {
  const y1 = p.y + p.h / 2;
  const y2 = c.y - c.h / 2;
  const mid = (y1 + y2) / 2;
  return `M ${p.x} ${y1} C ${p.x} ${mid}, ${c.x} ${mid}, ${c.x} ${y2}`;
}

/**
 * Prereq curve between two lessons anywhere in the tree. It leaves and enters horizontally so it
 * reads as a cross-link rather than another branch, and bows outward proportionally to the gap.
 */
function prereqPath(from: LaidOutNode, to: LaidOutNode): string {
  const leftToRight = from.x <= to.x;
  const x1 = from.x + (leftToRight ? from.w / 2 : -from.w / 2);
  const x2 = to.x + (leftToRight ? -to.w / 2 : to.w / 2);
  const bow = Math.min(180, Math.max(48, Math.abs(x2 - x1) / 2));
  return `M ${x1} ${from.y} C ${x1 + (leftToRight ? bow : -bow)} ${from.y}, ${
    x2 - (leftToRight ? bow : -bow)
  } ${to.y}, ${x2} ${to.y}`;
}

/** Width a subtree would occupy, from its leaf count — cheap, and exact enough to decide splits. */
function estimateWidth(n: TreeNode): number {
  if (n.children.length === 0) return sizeOf(n).w + TREE.gapX;
  return Math.max(
    sizeOf(n).w + TREE.gapX,
    n.children.reduce((s, c) => s + estimateWidth(c), 0),
  );
}

/**
 * The regions drawn as separate clusters. Starting from the root's children, any region too wide to
 * read as one cluster is replaced by its own children — so a single overgrown branch ("Numbers"
 * holding the entire curriculum) becomes several honest regions rather than one strip in a box.
 * A promoted region carries its ancestry in the title ("Numbers › Fractions").
 */
function islandsOf(roots: TreeNode[]): { node: TreeNode; title: string }[] {
  const top = roots.length === 1 && roots[0].children.length > 0 ? roots[0].children : roots;
  const out: { node: TreeNode; title: string }[] = [];

  const consider = (n: TreeNode, prefix: string[]) => {
    const title = [...prefix, n.title].join(" › ");
    const splittable = n.children.filter((c) => c.children.length > 0).length >= 2;
    if (estimateWidth(n) > TREE.maxRegionWidth && splittable) {
      // Lessons sitting directly under a split concept would be orphaned, so keep them together
      // as a region of their own alongside the promoted sub-concepts.
      const loose = n.children.filter((c) => c.children.length === 0);
      if (loose.length > 0) out.push({ node: { ...n, children: loose }, title });
      for (const c of n.children.filter((c) => c.children.length > 0))
        consider(c, [...prefix, n.title]);
      return;
    }
    out.push({ node: n, title });
  };

  for (const n of top) consider(n, []);
  return out;
}

function countLessons(n: TreeNode): number {
  return (n.kind === "lesson" ? 1 : 0) + n.children.reduce((s, c) => s + countLessons(c), 0);
}

/**
 * Lays out the curriculum as a grid of regions. Each region is a tidy tree in its own right; the
 * regions then wrap into rows, which keeps the whole map roughly screen-shaped instead of stretching
 * into one mile-wide strip as the curriculum grows.
 *
 * Prereq edges attach to the *first* rendered instance of each node id, so a bridge node drawn under
 * two parents still gets exactly one set of prereq links — and a prereq crossing regions is drawn
 * just like any other, which is exactly what it is.
 */
export function layoutTree(roots: TreeNode[]): Layout {
  const regions = islandsOf(roots);
  const nodes: LaidOutNode[] = [];
  const islands: Island[] = [];

  let rowX = 0;
  let rowY = 0;
  let rowH = 0;

  for (const { node: region, title } of regions) {
    const laid = place([region]);
    const left = Math.min(...laid.map((n) => n.x - n.w / 2));
    const right = Math.max(...laid.map((n) => n.x + n.w / 2));
    const top = Math.min(...laid.map((n) => n.y - n.h / 2));
    const bottom = Math.max(...laid.map((n) => n.y + n.h / 2));
    const boxW = right - left + TREE.islandPad * 2;
    const boxH = bottom - top + TREE.islandPad * 2 + TREE.islandHeader;

    // Wrap to a new row once this region would push the row past its target width.
    if (rowX > 0 && rowX + boxW > TREE.rowWidth) {
      rowY += rowH + TREE.islandGapY;
      rowX = 0;
      rowH = 0;
    }

    const dx = rowX + TREE.islandPad - left;
    const dy = rowY + TREE.islandPad + TREE.islandHeader - top;
    for (const n of laid) {
      n.x += dx;
      n.y += dy;
      nodes.push(n);
    }
    islands.push({
      id: region.id,
      title,
      planned: region.planned,
      lessonCount: countLessons(region),
      x: rowX,
      y: rowY,
      w: boxW,
      h: boxH,
    });

    rowX += boxW + TREE.islandGapX;
    rowH = Math.max(rowH, boxH);
  }

  if (nodes.length === 0)
    return { nodes, edges: [], islands, minX: 0, minY: 0, width: 0, height: 0 };

  const firstByIdKey = new Map<string, LaidOutNode>();
  for (const n of nodes) if (!firstByIdKey.has(n.id)) firstByIdKey.set(n.id, n);
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  const edges: LayoutEdge[] = [];
  for (const n of nodes) {
    const parentKey = n.key.includes("/") ? n.key.slice(0, n.key.lastIndexOf("/")) : null;
    const parent = parentKey ? byKey.get(parentKey) : undefined;
    if (parent) edges.push({ kind: "branch", from: parent.key, to: n.key, d: branchPath(parent, n) });

    if (firstByIdKey.get(n.id) !== n) continue; // bridge duplicate: prereqs already drawn
    for (const p of n.prereqs) {
      const src = firstByIdKey.get(p);
      if (src) edges.push({ kind: "prereq", from: src.key, to: n.key, d: prereqPath(src, n) });
    }
  }

  // Bounds follow the cluster boxes: they already enclose every node.
  const left = Math.min(...islands.map((i) => i.x));
  const right = Math.max(...islands.map((i) => i.x + i.w));
  const top = Math.min(...islands.map((i) => i.y));
  const bottom = Math.max(...islands.map((i) => i.y + i.h));
  return {
    nodes,
    edges,
    islands,
    minX: left - TREE.padding,
    minY: top - TREE.padding,
    width: right - left + TREE.padding * 2,
    height: bottom - top + TREE.padding * 2,
  };
}
