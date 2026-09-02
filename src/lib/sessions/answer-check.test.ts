import { describe, it, expect } from "vitest";
import { answerMatches, parseNumeric } from "./answer-check";

describe("parseNumeric understands how students actually write numbers", () => {
  it("reads plain numbers", () => {
    expect(parseNumeric("42")).toBe(42);
    expect(parseNumeric(" -3.5 ")).toBe(-3.5);
  });

  it("reads fractions and percentages", () => {
    expect(parseNumeric("3/4")).toBe(0.75);
    expect(parseNumeric("50%")).toBe(0.5);
  });

  it("ignores currency symbols and thousands separators", () => {
    expect(parseNumeric("$1,200")).toBe(1200);
  });

  it("returns null for text and for a zero denominator", () => {
    expect(parseNumeric("x + 1")).toBeNull();
    expect(parseNumeric("1/0")).toBeNull();
  });
});

describe("answerMatches is forgiving about form, strict about value", () => {
  it("treats equivalent numeric forms as the same answer", () => {
    expect(answerMatches("0.5", "1/2")).toBe(true);
    expect(answerMatches("50%", "0.5")).toBe(true);
  });

  it("still rejects a different value", () => {
    expect(answerMatches("0.6", "1/2")).toBe(false);
  });

  it("ignores case, padding and a trailing full stop in text answers", () => {
    expect(answerMatches("  Isosceles.  ", "isosceles")).toBe(true);
  });

  it("collapses internal whitespace", () => {
    expect(answerMatches("x  +  1", "x + 1")).toBe(true);
  });

  it("treats an empty answer as wrong rather than matching an empty expected value", () => {
    expect(answerMatches("   ", "")).toBe(false);
  });
});
