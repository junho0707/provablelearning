import { describe, expect, it } from "vitest";
import { layoutTree, wrapTitle, TREE } from "./layout";
import { getTree } from "./catalog";
import type { TreeNode } from "./types";

function node(partial: Partial<TreeNode> & { id: string }): TreeNode {
  return {
    title: partial.id,
    kind: "lesson",
    role: "core",
    number: null,
    hasContent: false,
    planned: false,
    prereqs: [],
    courseId: null,
    children: [],
    ...partial,
  };
}

/**
 * The map's top-level regions are the children of the single root, so a test tree needs a wrapper
 * root above the structure under test — otherwise its parts each become their own region.
 */
function inRegion(...regions: TreeNode[]): TreeNode[] {
  return [node({ id: "math", kind: "concept", children: regions })];
}

/** True when `inner`'s box lies entirely within `outer`'s — the containment the map is drawn with. */
function contains(outer: { x: number; y: number; w: number; h: number }, inner: typeof outer) {
  return (
    inner.x >= outer.x - 0.001 &&
    inner.y >= outer.y - 0.001 &&
    inner.x + inner.w <= outer.x + outer.w + 0.001 &&
    inner.y + inner.h <= outer.y + outer.h + 0.001
  );
}

describe("layoutTree", () => {
  it("nests a child's box inside its parent's, below the parent's header", () => {
    const roots = inRegion(
      node({
        id: "root",
        kind: "concept",
        children: [node({ id: "a" }), node({ id: "b" }), node({ id: "c" })],
      }),
    );
    const { nodes } = layoutTree(roots);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const root = byId.get("root")!;

    for (const id of ["a", "b", "c"]) {
      const child = byId.get(id)!;
      expect(contains(root, child), `${id} escapes root`).toBe(true);
      expect(child.y).toBeGreaterThanOrEqual(root.y + root.headerH - 0.001);
    }
  });

  it("nests every node of the real curriculum inside each of its ancestors", () => {
    const { nodes } = layoutTree(getTree());
    const byKey = new Map(nodes.map((n) => [n.key, n]));

    for (const n of nodes) {
      let key = n.key;
      while (key.includes("/")) {
        key = key.slice(0, key.lastIndexOf("/"));
        expect(contains(byKey.get(key)!, n), `${n.key} escapes ${key}`).toBe(true);
      }
    }
  });

  it("never overlaps two siblings", () => {
    const { nodes } = layoutTree(getTree());
    const parentOf = (k: string) => (k.includes("/") ? k.slice(0, k.lastIndexOf("/")) : "");
    const groups = new Map<string, typeof nodes>();
    for (const n of nodes) groups.set(parentOf(n.key), [...(groups.get(parentOf(n.key)) ?? []), n]);

    for (const siblings of groups.values()) {
      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          const a = siblings[i];
          const b = siblings[j];
          const apart =
            a.x + a.w <= b.x + 0.001 ||
            b.x + b.w <= a.x + 0.001 ||
            a.y + a.h <= b.y + 0.001 ||
            b.y + b.h <= a.y + 0.001;
          expect(apart, `${a.key} overlaps ${b.key}`).toBe(true);
        }
      }
    }
  });

  it("shrinks type with depth so the hierarchy is legible at a glance", () => {
    const { nodes } = layoutTree(getTree());
    const containers = nodes.filter((n) => n.isContainer);
    const sizeAt = (d: number) => containers.find((n) => n.depth === d)!.titleSize;

    expect(sizeAt(0)).toBeGreaterThan(sizeAt(1));
    expect(sizeAt(1)).toBeGreaterThan(sizeAt(2));
    expect(sizeAt(2)).toBeGreaterThan(sizeAt(3));
  });

  it("keeps the map roughly screen-shaped rather than one mile-wide strip", () => {
    const { width, height } = layoutTree(getTree());
    expect(width / height).toBeLessThan(4);
    expect(width / height).toBeGreaterThan(0.5);
  });

  it("draws the root as the outermost, largest container", () => {
    const { nodes } = layoutTree(getTree());
    const root = nodes[0];

    expect(root.id).toBe("math");
    expect(root.depth).toBe(0);
    for (const n of nodes.slice(1)) {
      expect(contains(root, n), `${n.key} escapes the root`).toBe(true);
      expect(n.titleSize).toBeLessThanOrEqual(root.titleSize);
    }
  });

  it("emits one prereq edge per declared prereq and no other edges", () => {
    const roots = inRegion(
      node({
        id: "root",
        kind: "concept",
        children: [node({ id: "a" }), node({ id: "b", prereqs: ["a"] })],
      }),
    );
    const { edges } = layoutTree(roots);
    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe("prereq");
    expect(edges[0].d).toMatch(/^M [\d.-]+ [\d.-]+ C /);
  });

  it("drops a prereq pointing at a node that isn't on the map instead of throwing", () => {
    const roots = inRegion(
      node({ id: "root", kind: "concept", children: [node({ id: "a", prereqs: ["ghost"] })] }),
    );
    expect(layoutTree(roots).edges).toHaveLength(0);
  });

  it("chains the numbered lessons into the teaching order, one edge per step", () => {
    const roots = inRegion(
      node({
        id: "root",
        kind: "concept",
        children: [node({ id: "b", number: 2 }), node({ id: "a", number: 1 }), node({ id: "x" })],
      }),
    );
    const { edges, order } = layoutTree(roots);
    const byKey = new Map(layoutTree(roots).nodes.map((n) => [n.key, n.id]));
    const steps = edges.filter((e) => e.kind === "order");

    expect(order.map((k) => byKey.get(k))).toEqual(["a", "b"]); // unnumbered "x" is not a step
    expect(steps).toHaveLength(order.length - 1);
    expect([byKey.get(steps[0].from), byKey.get(steps[0].to)]).toEqual(["a", "b"]);
  });

  it("orders the real curriculum by lesson number with no repeats", () => {
    const { nodes, order } = layoutTree(getTree());
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    const numbers = order.map((k) => byKey.get(k)!.number!);

    expect(new Set(order).size).toBe(order.length);
    expect([...numbers]).toEqual([...numbers].sort((a, b) => a - b));
  });

  it("counts the lessons nested beneath each container", () => {
    const { nodes } = layoutTree(getTree());
    const numbers = nodes.find((n) => n.id === "numbers")!;
    const lessons = nodes.filter((n) => n.kind === "lesson").length;

    expect(numbers.lessonCount).toBeGreaterThan(1);
    expect(numbers.lessonCount).toBeLessThanOrEqual(lessons);
  });

  it("bounds the real curriculum tightly around its boxes", () => {
    const { nodes, minX, minY, width, height } = layoutTree(getTree());
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(minX);
      expect(n.x + n.w).toBeLessThanOrEqual(minX + width);
      expect(n.y).toBeGreaterThanOrEqual(minY);
      expect(n.y + n.h).toBeLessThanOrEqual(minY + height);
    }
  });

  it("marks descendants of a planned region as planned", () => {
    const planned = layoutTree(getTree()).nodes.filter((n) => n.planned);
    expect(planned.some((n) => n.id === "algebra")).toBe(true);
    expect(planned.every((n) => !n.hasContent)).toBe(true);
  });
});

describe("wrapTitle", () => {
  it("breaks on words and never exceeds the line budget", () => {
    expect(wrapTitle("Multiples and Least Common Multiples", 14).length).toBeLessThanOrEqual(
      TREE.maxLines,
    );
  });

  it("ellipsises a title too long to fit", () => {
    const lines = wrapTitle("one two three four five six seven eight nine ten eleven", 6);
    expect(lines).toHaveLength(TREE.maxLines);
    expect(lines[TREE.maxLines - 1]).toMatch(/…$/);
  });
});
