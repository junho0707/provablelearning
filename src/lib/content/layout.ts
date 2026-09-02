import type { TreeNode } from "./types";

/**
 * Skill-tree layout: turns the curriculum tree into positioned boxes plus prerequisite edges.
 *
 * Pure and deterministic — no DOM, no measurement — so the whole map is computed at build time and
 * shipped as data. The client only pans, zooms, and highlights.
 *
 * The two relationships are drawn with two different mechanisms, which is what keeps them apart:
 * - **containment** (`parent`) is *nesting*: a concept is a box, and its children sit inside it. No
 *   line is needed, so the only lines left on the map mean one thing.
 * - **prereq** (`prereqs`) is the arrow — must-learn-before, drawn across the nesting.
 *
 * Depth is carried by type size and by one step of background lightness per level, never by hue.
 */

/** Per-depth box metrics. Deeper levels get smaller type, tighter padding — the visual hierarchy. */
const LEVEL = [
  { title: 38, header: 82, pad: 34, gap: 30, tracking: 1.2 },
  { title: 27, header: 58, pad: 26, gap: 24, tracking: 0.6 },
  { title: 19, header: 43, pad: 19, gap: 18, tracking: 0.3 },
  { title: 15.5, header: 35, pad: 15, gap: 14, tracking: 0.2 },
  { title: 13.5, header: 31, pad: 13, gap: 12, tracking: 0 },
  { title: 12.5, header: 28, pad: 11, gap: 10, tracking: 0 },
] as const;

export const TREE = {
  /** Every leaf card is the same width, so rows line up and titles wrap predictably. */
  leafW: 200,
  leafPadX: 13,
  leafPadY: 13,
  leafLine: 16,
  /** A lesson title never grows past the card; a childless concept keeps a little more of its rank. */
  leafTitleMax: { lesson: 13, concept: 15 },
  maxLines: 3,
  padding: 72,
  /** Wide:tall shape each level is packed toward. The map reads best when regions stay landscape. */
  aspect: [1.7, 2.1, 1.9, 1.7, 1.5, 1.4] as const,
} as const;

const level = (d: number) => LEVEL[Math.min(Math.max(d, 0), LEVEL.length - 1)];
const aspectAt = (d: number) => TREE.aspect[Math.min(Math.max(d, 0), TREE.aspect.length - 1)];

/** Advance width, near enough for a fixed UI font — layout only needs boxes that don't clip. */
const textWidth = (s: string, size: number) => s.length * size * 0.56;

/** Greedy wrap to at most `TREE.maxLines`, the last line ellipsised if the title overruns. */
export function wrapTitle(title: string, perLine: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const w of title.split(" ")) {
    if (line && (line + " " + w).length > perLine) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= TREE.maxLines) return lines;
  const kept = lines.slice(0, TREE.maxLines - 1);
  const rest = lines.slice(TREE.maxLines - 1).join(" ");
  return [...kept, `${rest.slice(0, perLine - 1)}…`];
}

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
  /** True when this box holds other boxes: it is drawn as a container, not a card. */
  isContainer: boolean;
  /** Lessons nested anywhere beneath, self included. */
  lessonCount: number;
  /** Top-left corner and size, in layout space. Boxes nest, so children lie inside their parent. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Height of the title strip; a container's children start below it. Cards fill their whole box. */
  headerH: number;
  /** Pre-wrapped title and its type size — the visual rank of this level. */
  lines: string[];
  titleSize: number;
  tracking: number;
};

export type LayoutEdge = {
  /** `prereq` — must-learn-before. `order` — the next lesson the course actually teaches. */
  kind: "prereq" | "order";
  from: string;
  to: string;
  /** SVG path `d`, in layout space. */
  d: string;
};

export type Layout = {
  /** Parents before children, so painting them in order nests correctly. */
  nodes: LaidOutNode[];
  edges: LayoutEdge[];
  /** Lesson keys in teaching order (by `number`) — the sequence the `order` edges run through. */
  order: string[];
  /** Bounding box in layout space, already padded — feed straight into an SVG `viewBox`. */
  minX: number;
  minY: number;
  width: number;
  height: number;
};

/** A measured, not yet positioned, box. */
type Box = {
  node: TreeNode;
  depth: number;
  w: number;
  h: number;
  headerH: number;
  lines: string[];
  titleSize: number;
  tracking: number;
  pad: number;
  lessonCount: number;
  /** Children grouped into rows, in curriculum order; empty for a card. */
  rows: Box[][];
};

/**
 * Flows boxes into rows, trying every row length and keeping the one whose block comes closest to
 * the target proportion. Curriculum order is preserved — rows read left to right, top to bottom.
 */
function pack(kids: Box[], gap: number, target: number) {
  let best: { rows: Box[][]; w: number; h: number } | null = null;
  let bestScore = Infinity;

  for (let perRow = 1; perRow <= kids.length; perRow++) {
    const rows: Box[][] = [];
    for (let i = 0; i < kids.length; i += perRow) rows.push(kids.slice(i, i + perRow));

    const w = Math.max(...rows.map((r) => r.reduce((s, b) => s + b.w, 0) + gap * (r.length - 1)));
    const h =
      rows.reduce((s, r) => s + Math.max(...r.map((b) => b.h)), 0) + gap * (rows.length - 1);

    const score = Math.abs(Math.log(w / h / target));
    if (!best || score < bestScore) {
      best = { rows, w, h };
      bestScore = score;
    }
  }
  return best!;
}

function countLessons(n: TreeNode): number {
  return (n.kind === "lesson" ? 1 : 0) + n.children.reduce((s, c) => s + countLessons(c), 0);
}

/** Sizes a subtree bottom-up: a container is exactly as big as its packed children plus its header. */
function measure(node: TreeNode, depth: number): Box {
  const L = level(depth);
  const lessonCount = countLessons(node);

  if (node.children.length === 0) {
    // A card always reads one notch below the container holding it, so the bottom of the hierarchy
    // stays distinguishable even where the depth scale has bottomed out.
    const size = Math.max(11, Math.min(L.title - 1.5, TREE.leafTitleMax[node.kind]));
    const inner = TREE.leafW - TREE.leafPadX * 2;
    const lines = wrapTitle(node.title, Math.max(8, Math.floor(inner / (size * 0.52))));
    const h = TREE.leafPadY * 2 + lines.length * TREE.leafLine + (node.number != null ? 14 : 0);
    return {
      node,
      depth,
      w: TREE.leafW,
      h,
      headerH: h,
      lines,
      titleSize: size,
      tracking: 0,
      pad: TREE.leafPadX,
      lessonCount,
      rows: [],
    };
  }

  const kids = node.children.map((c) => measure(c, depth + 1));
  const { rows, w: innerW, h: innerH } = pack(kids, L.gap, aspectAt(depth));

  // Cards in a row are levelled to the tallest *card*, so a row of leaves reads as one band of
  // siblings instead of a ragged edge. Levelling against a container sibling instead would stretch
  // a one-line card to the height of a whole subtree, so containers are excluded from both sides.
  for (const row of rows) {
    const leaves = row.filter((b) => b.rows.length === 0);
    if (leaves.length < 2) continue;
    const cardH = Math.max(...leaves.map((b) => b.h));
    for (const b of leaves) {
      b.h = cardH;
      b.headerH = cardH;
    }
  }

  // A container is never narrower than its own title plus the room the header meta needs.
  const titleW = textWidth(node.title, L.title) + (depth === 0 ? 130 : 60);
  const w = Math.max(innerW, titleW) + L.pad * 2;

  return {
    node,
    depth,
    w,
    h: L.header + innerH + L.pad,
    headerH: L.header,
    lines: [node.title],
    titleSize: L.title,
    tracking: L.tracking,
    pad: L.pad,
    lessonCount,
    rows,
  };
}

/** Walks a measured box tree, emitting absolutely positioned nodes (parents first). */
function position(
  box: Box,
  x: number,
  y: number,
  trail: string[],
  parentKey: string | null,
  out: LaidOutNode[],
) {
  const n = box.node;
  const key = parentKey ? `${parentKey}/${n.id}` : n.id;

  out.push({
    key,
    id: n.id,
    title: n.title,
    kind: n.kind,
    role: n.role,
    number: n.number,
    hasContent: n.hasContent,
    planned: n.planned,
    prereqs: n.prereqs,
    trail,
    depth: box.depth,
    isContainer: box.rows.length > 0,
    lessonCount: box.lessonCount,
    x,
    y,
    w: box.w,
    h: box.h,
    headerH: box.headerH,
    lines: box.lines,
    titleSize: box.titleSize,
    tracking: box.tracking,
  });

  const gap = level(box.depth).gap;
  let cy = y + box.headerH;
  for (const row of box.rows) {
    let cx = x + box.pad;
    for (const child of row) {
      position(child, cx, cy, [...trail, n.title], key, out);
      cx += child.w + gap;
    }
    cy += Math.max(...row.map((b) => b.h)) + gap;
  }
}

/** Where a prereq arrow attaches: a card's middle, a container's header strip. */
function anchor(n: LaidOutNode) {
  return { x: n.x + n.w / 2, y: n.isContainer ? n.y + n.headerH / 2 : n.y + n.h / 2 };
}

/**
 * Prereq curve between two nodes anywhere on the map. It leaves and enters horizontally so it reads
 * as a cross-link rather than part of the nesting, and bows outward proportionally to the gap.
 */
function prereqPath(from: LaidOutNode, to: LaidOutNode): string {
  const a = anchor(from);
  const b = anchor(to);
  const leftToRight = a.x <= b.x;
  const x1 = leftToRight ? from.x + from.w : from.x;
  const x2 = leftToRight ? to.x : to.x + to.w;
  const bow = Math.min(190, Math.max(50, Math.abs(x2 - x1) / 2));
  return `M ${x1} ${a.y} C ${x1 + (leftToRight ? bow : -bow)} ${a.y}, ${
    x2 - (leftToRight ? bow : -bow)
  } ${b.y}, ${x2} ${b.y}`;
}

/**
 * Course-order curve: leaves the bottom of one lesson and enters the top of the next, so the
 * teaching sequence is distinguishable from a prereq link by its shape alone, before any colour.
 */
function orderPath(from: LaidOutNode, to: LaidOutNode): string {
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;
  const lift = Math.min(160, Math.max(40, Math.abs(y2 - y1) / 2 + Math.abs(x2 - x1) / 6));
  return `M ${x1} ${y1} C ${x1} ${y1 + lift}, ${x2} ${y2 - lift}, ${x2} ${y2}`;
}

/**
 * Lays out the whole curriculum as nested boxes.
 *
 * The root ("Math") is the outermost box and everything else sits inside it, so the single biggest
 * container on the map is the subject itself. Its children are packed into rows, which keeps the
 * map roughly screen-shaped rather than stretching into a mile-wide strip.
 *
 * Prereq and order edges attach to the *first* rendered instance of each node id, so a bridge node
 * drawn under two parents still gets exactly one set of links.
 */
export function layoutTree(roots: TreeNode[]): Layout {
  const boxes = roots.map((n) => measure(n, 0));

  const nodes: LaidOutNode[] = [];
  if (boxes.length === 0)
    return { nodes, edges: [], order: [], minX: 0, minY: 0, width: 0, height: 0 };

  const gap = LEVEL[0].gap;
  const { rows } = pack(boxes, gap, aspectAt(0));
  let y = 0;
  for (const row of rows) {
    let x = 0;
    for (const box of row) {
      position(box, x, y, [], null, nodes);
      x += box.w + gap;
    }
    y += Math.max(...row.map((b) => b.h)) + gap;
  }

  const firstById = new Map<string, LaidOutNode>();
  for (const n of nodes) if (!firstById.has(n.id)) firstById.set(n.id, n);

  const edges: LayoutEdge[] = [];
  for (const n of nodes) {
    if (firstById.get(n.id) !== n) continue; // bridge duplicate: prereqs already drawn
    for (const p of n.prereqs) {
      const src = firstById.get(p);
      if (src) edges.push({ kind: "prereq", from: src.key, to: n.key, d: prereqPath(src, n) });
    }
  }

  // The teaching sequence: every numbered lesson, once, in curriculum order.
  const sequence = [...firstById.values()]
    .filter((n) => n.number != null)
    .sort((a, b) => a.number! - b.number!);
  for (let i = 1; i < sequence.length; i++)
    edges.push({
      kind: "order",
      from: sequence[i - 1].key,
      to: sequence[i].key,
      d: orderPath(sequence[i - 1], sequence[i]),
    });

  const left = Math.min(...nodes.map((n) => n.x));
  const right = Math.max(...nodes.map((n) => n.x + n.w));
  const topY = Math.min(...nodes.map((n) => n.y));
  const bottom = Math.max(...nodes.map((n) => n.y + n.h));
  return {
    nodes,
    edges,
    order: sequence.map((n) => n.key),
    minX: left - TREE.padding,
    minY: topY - TREE.padding,
    width: right - left + TREE.padding * 2,
    height: bottom - topY + TREE.padding * 2,
  };
}
