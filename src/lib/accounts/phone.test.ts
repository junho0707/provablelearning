import { describe, expect, it } from "vitest";
import { setPhone } from "./phone";

// Validation short-circuit only — same pattern as profiles.test.ts.

describe("setPhone — validation short-circuit", () => {
  it("rejects an empty string", async () => {
    const result = await setPhone("");
    expect(result.ok).toBe(false);
  });

  it("rejects non-phone text", async () => {
    const result = await setPhone("call me maybe");
    expect(result.ok).toBe(false);
  });
});
