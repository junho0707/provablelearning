import { describe, expect, it } from "vitest";
import { formatTimeRemaining } from "./time-remaining";

describe("formatTimeRemaining", () => {
  it("formats hours and minutes together", () => {
    expect(formatTimeRemaining(200)).toBe("3h 20m");
  });

  it("formats minutes only under an hour", () => {
    expect(formatTimeRemaining(45)).toBe("45m");
  });

  it("formats a whole number of hours as 'Nh 0m'", () => {
    expect(formatTimeRemaining(120)).toBe("2h 0m");
  });

  it("treats zero or negative as 'now'", () => {
    expect(formatTimeRemaining(0)).toBe("now");
    expect(formatTimeRemaining(-5)).toBe("now");
  });
});
