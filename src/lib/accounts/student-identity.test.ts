import { describe, it, expect } from "vitest";
import { STUDENT_EMAIL_DOMAIN, studentEmail, isStudentEmail } from "./student-identity";
import { usernameSchema, studentPasswordSchema } from "./types";

/**
 * `INV-AUTH-2` is enforced by the address itself rather than by a rule in the sending code, so it
 * is worth asserting directly: the domain is in the reserved `.invalid` TLD (RFC 2606), which is
 * guaranteed never to resolve. No message can reach a student even if some future code tries.
 */
describe("student identities are unreachable by email (INV-AUTH-2)", () => {
  it("uses the reserved .invalid TLD", () => {
    expect(STUDENT_EMAIL_DOMAIN.endsWith(".invalid")).toBe(true);
  });

  it("builds a deterministic, lowercase address from a username", () => {
    expect(studentEmail("Ada.L")).toBe(`ada.l@${STUDENT_EMAIL_DOMAIN}`);
    expect(studentEmail("  ada  ")).toBe(`ada@${STUDENT_EMAIL_DOMAIN}`);
  });

  it("recognises its own addresses and rejects real ones", () => {
    expect(isStudentEmail(studentEmail("ada"))).toBe(true);
    expect(isStudentEmail("parent@example.com")).toBe(false);
    expect(isStudentEmail(null)).toBe(false);
  });
});

describe("username rules match what a child can type", () => {
  it("accepts letters, digits, dots, dashes and underscores", () => {
    for (const name of ["ada", "ada.lovelace", "ada-l", "ada_1", "ADA99"]) {
      expect(usernameSchema.safeParse(name).success).toBe(true);
    }
  });

  it("rejects anything too short, too long, or containing spaces or symbols", () => {
    for (const name of ["ad", "a".repeat(41), "ada lovelace", "ada@home", ""]) {
      expect(usernameSchema.safeParse(name).success).toBe(false);
    }
  });
});

describe("student passwords are long enough but have no composition rules", () => {
  it("accepts a simple 8-character password a parent can say out loud", () => {
    expect(studentPasswordSchema.safeParse("bluemath").success).toBe(true);
  });

  it("rejects anything shorter than 8", () => {
    expect(studentPasswordSchema.safeParse("blue").success).toBe(false);
  });

  it("does not require mixed case, digits or symbols", () => {
    expect(studentPasswordSchema.safeParse("aaaaaaaa").success).toBe(true);
  });
});
