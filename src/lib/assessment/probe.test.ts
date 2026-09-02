import { describe, expect, it } from "vitest";
import { nextProbe, ASSESSMENT_CAP, type ProbeRecord } from "./probe";

/** Drives `nextProbe` to completion against a fixture oracle — the interactive loop, synchronously. */
function runFixture(
  currentNodeId: string,
  getPrereqs: (id: string) => string[],
  oracle: (id: string) => boolean,
  cap?: number,
) {
  const history: ProbeRecord[] = [];
  let result = nextProbe(history, currentNodeId, getPrereqs, cap);
  while (!result.done) {
    history.push({ nodeId: result.nodeId, isCorrect: oracle(result.nodeId) });
    result = nextProbe(history, currentNodeId, getPrereqs, cap);
  }
  return { floorNodeIds: result.floorNodeIds, probeCount: history.length, history };
}

describe("AT-FIRST-003: strong student — solid on every probe near current class", () => {
  it("answers only the current-class probes (3), never touches the rest of the closure", () => {
    const graph: Record<string, string[]> = {
      current: ["mid"],
      mid: ["foundation"],
      foundation: [],
    };
    const { probeCount, floorNodeIds, history } = runFixture("current", (id) => graph[id] ?? [], () => true);

    expect(probeCount).toBe(3);
    expect(floorNodeIds).toEqual([]);
    expect(history.every((h) => h.nodeId === "current")).toBe(true);
  });
});

describe("AT-FIRST-004: injected Grade-4 gap is located by descent", () => {
  it("cascades down through consistent failures and stops once a probe succeeds, naming the floor", () => {
    const graph: Record<string, string[]> = {
      algebra1: ["grade6-fractions"],
      "grade6-fractions": ["grade4-fractions"],
      "grade4-fractions": ["grade2-fractions"],
      "grade2-fractions": [],
    };
    const oracle = (id: string) => id === "grade2-fractions"; // everything above the gap fails

    const { floorNodeIds, history } = runFixture("algebra1", (id) => graph[id] ?? [], oracle);

    // The walk actually reached and probed the gap...
    expect(history.some((h) => h.nodeId === "grade4-fractions")).toBe(true);
    // ...and located it as (part of) the floor, without probing anything below grade2 (there is nothing).
    expect(floorNodeIds).toContain("grade4-fractions");
    // The correct answer at grade2 stopped the descent — grade2 itself isn't a floor node.
    expect(floorNodeIds).not.toContain("grade2-fractions");
  });

  it("a solid mid-level node is not drilled into further (correct stops descent)", () => {
    const graph: Record<string, string[]> = {
      current: ["solidBranch", "brokenBranch"],
      solidBranch: ["neverProbed"],
      brokenBranch: ["brokenLeaf"],
      neverProbed: [],
      brokenLeaf: [],
    };
    const oracle = (id: string) => id !== "current" && id !== "brokenBranch" && id !== "brokenLeaf";

    const { history, floorNodeIds } = runFixture("current", (id) => graph[id] ?? [], oracle);

    expect(history.some((h) => h.nodeId === "neverProbed")).toBe(false);
    expect(floorNodeIds).toContain("brokenLeaf");
  });
});

describe("AT-FIRST-005: the ≈25-question cap is never exceeded, even on a deep closure", () => {
  it("stops at the cap on a long chain of consistent failures", () => {
    const chain: Record<string, string[]> = {};
    for (let i = 0; i < 30; i++) chain[`n${i}`] = i + 1 < 30 ? [`n${i + 1}`] : [];

    const { probeCount } = runFixture("n0", (id) => chain[id] ?? [], () => false);

    expect(probeCount).toBe(ASSESSMENT_CAP);
    expect(probeCount).toBeLessThanOrEqual(25);
  });

  it("respects a custom cap", () => {
    const chain: Record<string, string[]> = {};
    for (let i = 0; i < 10; i++) chain[`n${i}`] = i + 1 < 10 ? [`n${i + 1}`] : [];

    const { probeCount } = runFixture("n0", (id) => chain[id] ?? [], () => false, 5);
    expect(probeCount).toBe(5);
  });
});

describe("nextProbe — resumability", () => {
  it("gives the same next probe for the same history (pure, stateless)", () => {
    const graph: Record<string, string[]> = { a: ["b"], b: [] };
    const history: ProbeRecord[] = [];
    const first = nextProbe(history, "a", (id) => graph[id] ?? []);
    const second = nextProbe(history, "a", (id) => graph[id] ?? []);
    expect(first).toEqual(second);
  });
});
