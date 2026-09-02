/**
 * TASK-FIRST-003 — probe-and-descend assessment engine (`strengths` mode only, spec/14 §6).
 * "Sparse at the bottom, dense near the student's current level":
 *
 * - Probing starts at the student's **current class** node (depth 0) and only moves to *more*
 *   foundational nodes (depth+1, following `prereqs`) when a probe is answered **wrong** —
 *   "descend into that node's own prerequisites to locate the true floor".
 * - A **correct** result marks that node solid and stops descent on that branch — the student
 *   isn't drilled on prerequisites of something they've already shown they know.
 * - Nodes **at or near the current class** (depth ≤ 1) get 3 probes (spec's "2–3"); deeper nodes
 *   get 1 — sparse once we're clearly below the level being assessed.
 * - **Hard cap ≈25 questions**, enforced by never asking a probe once the cap is reached.
 *
 * Stateless and replay-based on purpose: a web request can't hold an in-memory generator between
 * "ask a question" and "get the answer", so `nextProbe` recomputes the walk from the full
 * `AssessmentItem` history every call — the same history a server action would read back from
 * `assessment_items` (07_DATA_MODEL). This is also what makes the traversal a **pure function**,
 * testable over a fixture prerequisite graph with no database (per the implementation plan's DoD).
 */

export type ProbeRecord = { nodeId: string; isCorrect: boolean };

export type NextProbe =
  | { done: false; nodeId: string; depth: number }
  | { done: true; floorNodeIds: string[] };

const NEAR_CURRENT_PROBES = 3;
const FAR_PROBES = 1;
export const ASSESSMENT_CAP = 25;

/** How many probes a node at this depth from the current class gets (spec/14 §6). */
export function probesFor(depth: number): number {
  return depth <= 1 ? NEAR_CURRENT_PROBES : FAR_PROBES;
}

/**
 * Given everything probed so far, returns the next node to probe, or the finished result. `depth`
 * counts steps below the current class (0 = the current class node itself).
 */
export function nextProbe(
  history: ProbeRecord[],
  currentNodeId: string,
  getPrereqs: (nodeId: string) => string[],
  cap: number = ASSESSMENT_CAP,
): NextProbe {
  let cursor = 0;
  const floor: string[] = [];

  // Depth-first: only descends into `getPrereqs(nodeId)` when `nodeId` itself came back wrong.
  function visit(nodeId: string, depth: number): NextProbe | null {
    const numProbes = probesFor(depth);
    let allCorrect = true;

    for (let i = 0; i < numProbes; i++) {
      if (cursor >= history.length) {
        if (history.length >= cap) return { done: true, floorNodeIds: floor };
        return { done: false, nodeId, depth };
      }
      if (!history[cursor++].isCorrect) allCorrect = false;
    }

    if (allCorrect) return null; // solid — no descent into this node's prereqs

    floor.push(nodeId);
    for (const prereqId of getPrereqs(nodeId)) {
      const result = visit(prereqId, depth + 1);
      if (result) return result;
    }
    return null; // this branch bottomed out (a leaf, or every prereq below it is solid)
  }

  const pending = visit(currentNodeId, 0);
  return pending ?? { done: true, floorNodeIds: floor };
}
