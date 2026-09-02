import { describe, expect, it } from "vitest";
import { profileInputSchema, validCourseNode } from "./types";
import { createProfile, updateProfile } from "./profiles";

// TASK-ACCT-001. These exercise only the validation short-circuit — createProfile/updateProfile
// return before touching Supabase for malformed input, so no live session/DB is needed. The
// authenticated path (real insert/update, RLS denial) needs a live Supabase project; not testable
// in this environment (same limitation as AUTH-001 — see STATUS.md).

describe("profileInputSchema", () => {
  it("rejects an empty name", () => {
    expect(profileInputSchema.safeParse({ name: "  " }).success).toBe(false);
  });

  it("accepts a bare name", () => {
    expect(profileInputSchema.safeParse({ name: "Ada" }).success).toBe(true);
  });
});

describe("validCourseNode", () => {
  it("accepts null/undefined (no current class chosen)", () => {
    expect(validCourseNode(null)).toBe(true);
    expect(validCourseNode(undefined)).toBe(true);
  });

  it("accepts a real course-level node id", () => {
    expect(validCourseNode("algebra")).toBe(true);
  });

  it("rejects an id that isn't a course-level node", () => {
    expect(validCourseNode("fractions")).toBe(false);
    expect(validCourseNode("not-a-real-node")).toBe(false);
  });
});

describe("createProfile — validation short-circuit", () => {
  it("rejects an empty name before touching Supabase", async () => {
    const result = await createProfile({ name: "" });
    expect(result).toEqual({ ok: false, code: "malformed", message: "Invalid profile." });
  });

  it("rejects an unknown current class before touching Supabase", async () => {
    const result = await createProfile({ name: "Ada", currentCourseNode: "not-a-real-node" });
    expect(result).toEqual({ ok: false, code: "malformed", message: "Unknown current class." });
  });
});

describe("updateProfile — validation short-circuit", () => {
  it("rejects an unknown current class before touching Supabase", async () => {
    const result = await updateProfile("some-id", { currentCourseNode: "not-a-real-node" });
    expect(result).toEqual({ ok: false, code: "malformed", message: "Unknown current class." });
  });
});
