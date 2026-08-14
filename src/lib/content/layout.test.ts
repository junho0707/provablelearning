import { describe, expect, it } from "vitest";
import { layoutTree, TREE } from "./layout";
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
    children: [],
    ...partial,
  };
}

/**
 * The map's top-level regions are the children of the single root, so a test tree needs a wrapper
 * root above the structure under test — otherwise its parts each become their own island.
 */
function inRegion(...regions: TreeNode[]): TreeNode[] {
  return [node({ id: "math", kind: "concept", children: regions })];
}

describe("layoutTree", () => {
  it("places children below their parent and centres the parent over them", () => {
    const roots = inRegion(
      node({
        id: "root",
        kind: "concept",
        children: [node({ id: "a" }), node({ id: "b" }), node({ id: "c" })],
      }),
    );
    const { nodes } = layoutTree(roots);
    const byId = new Map(nodes.map((n) => [n.id, n]));

    for (const id of ["a", "b", "c"]) {
      expect(byId.get(id)!.y).toBeGreaterThan(byId.get("root")!.y);
    }
    expect(byId.get("root")!.x).toBeCloseTo((byId.get("a")!.x + byId.get("c")!.x) / 2);
    expect(byId.get("root")!.x).toBeCloseTo(byId.get("b")!.x);
  });

  it("wraps regions into rows so the map stays roughly screen-shaped", () => {
    const { islands, width, height } = layoutTree(getTree());

    expect(islands.map((i) => i.id)).toContain("algebra");
    expect(islands.length).toBeGreaterThan(1);
    // The old single-row layout was ~9:1. Anything near that is a strip, not a map.
    expect(width / height).toBeLessThan(4);

    // No two cluster boxes may overlap.
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        const a = islands[i];
        const b = islands[j];
        const apart =
          a.x + a.w <= b.x + 0.001 ||
          b.x + b.w <= a.x + 0.001 ||
          a.y + a.h <= b.y + 0.001 ||
          b.y + b.h <= a.y + 0.001;
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
  });

  it("keeps every node inside its own region's cluster box", () => {
    const { nodes, islands } = layoutTree(getTree());
    for (const island of islands) {
      const inside = nodes.filter(
        (n) => n.x >= island.x && n.x <= island.x + island.w && n.y >= island.y && n.y <= island.y + island.h,
      );
      expect(inside.length).toBeGreaterThan(0);
      for (const n of inside) {
        expect(n.x - n.w / 2).toBeGreaterThanOrEqual(island.x);
        expect(n.x + n.w / 2).toBeLessThanOrEqual(island.x + island.w);
        expect(n.y + n.h / 2).toBeLessThanOrEqual(island.y + island.h);
      }
    }
  });

  it("never overlaps two nodes on the same row", () => {
    const { nodes } = layoutTree(getTree());
    const byRow = new Map<number, typeof nodes>();
    for (const n of nodes) byRow.set(n.y, [...(byRow.get(n.y) ?? []), n]);

    for (const row of byRow.values()) {
      const sorted = [...row].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].x - sorted[i].w / 2 - (sorted[i - 1].x + sorted[i - 1].w / 2);
        expect(gap).toBeGreaterThanOrEqual(-0.001);
      }
    }
  });

  it("widens a subtree so a parent wider than its only child still gets its own lane", () => {
    const roots = inRegion(
      node({
        id: "root",
        kind: "concept",
        children: [
          node({ id: "wide", kind: "concept", children: [node({ id: "only" })] }),
          node({ id: "sibling" }),
        ],
      }),
    );
    const { nodes } = layoutTree(roots);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const gap = byId.get("sibling")!.x - TREE.lessonW / 2 - (byId.get("wide")!.x + TREE.conceptW / 2);
    expect(gap).toBeGreaterThanOrEqual(0);
  });

  it("emits one branch edge per parent-child link and one prereq edge per declared prereq", () => {
    const roots = inRegion(
      node({
        id: "root",
        kind: "concept",
        children: [node({ id: "a" }), node({ id: "b", prereqs: ["a"] })],
      }),
    );
    const { edges } = layoutTree(roots);
    expect(edges.filter((e) => e.kind === "branch")).toHaveLength(2);
    const prereq = edges.filter((e) => e.kind === "prereq");
    expect(prereq).toHaveLength(1);
    expect(prereq[0].d).toMatch(/^M [\d.-]+ [\d.-]+ C /);
  });

  it("drops a prereq pointing at a node that isn't on the map instead of throwing", () => {
    const roots = inRegion(
      node({ id: "root", kind: "concept", children: [node({ id: "a", prereqs: ["ghost"] })] }),
    );
    expect(layoutTree(roots).edges.filter((e) => e.kind === "prereq")).toHaveLength(0);
  });

  it("bounds the real curriculum tightly around its nodes", () => {
    const { nodes, minX, minY, width, height } = layoutTree(getTree());
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(n.x - n.w / 2).toBeGreaterThanOrEqual(minX);
      expect(n.x + n.w / 2).toBeLessThanOrEqual(minX + width);
      expect(n.y - n.h / 2).toBeGreaterThanOrEqual(minY);
      expect(n.y + n.h / 2).toBeLessThanOrEqual(minY + height);
    }
  });

  it("marks descendants of a planned region as planned", () => {
    const planned = layoutTree(getTree()).nodes.filter((n) => n.planned);
    expect(planned.some((n) => n.id === "algebra")).toBe(true);
    expect(planned.every((n) => !n.hasContent)).toBe(true);
  });
});
