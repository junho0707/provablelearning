import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { normalizeClassLevel } from "./class-level";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/0023_diagnostics.sql"),
  "utf8",
);

/** SQL-text checks for R7. Live equivalents are `AT-PRE-3`, `AT-PRE-4`, `AT-PRE-7`, `AT-OPS-5`. */

describe("a diagnostic is keyed by test slug or class level, never both", () => {
  it("adds the kind and its key columns", () => {
    expect(sql).toMatch(/add column kind text not null default 'test_prep'/);
    expect(sql).toMatch(/check \(kind in \('test_prep', 'math_diagnostic'\)\)/);
    expect(sql).toMatch(/add column class_level text/);
  });

  it("requires a class level for exactly the math diagnostics", () => {
    expect(sql).toMatch(
      /check \(\(kind = 'math_diagnostic'\) = \(class_level is not null\)\)/,
    );
  });

  it("allows only one set per class level", () => {
    expect(sql).toMatch(/create unique index practice_tests_class_level_idx on practice_tests \(class_level\)/);
  });
});

describe("unpublished sets are invisible to students", () => {
  it("replaces the public read policy with a published-only one", () => {
    expect(sql).toMatch(/drop policy practice_tests_public_read on practice_tests/);
    const policy = sql.slice(sql.indexOf("create policy practice_tests_published_read"));
    expect(policy.slice(0, 200)).toMatch(/published_at is not null/);
  });

  it("hides the questions of an unpublished set too", () => {
    expect(sql).toMatch(/drop policy test_prep_questions_public_read on test_prep_questions/);
    const policy = sql.slice(sql.indexOf("create policy test_prep_questions_published_read"));
    expect(policy.slice(0, 300)).toMatch(/t\.published_at is not null/);
  });

  it("never re-grants the answer column while changing the policies", () => {
    expect(sql).not.toMatch(/grant \w[^;]*\banswer\b/);
    expect(sql).not.toMatch(/grant select on test_prep_questions/);
    expect(sql).not.toMatch(/grant all on (practice_tests|test_prep_questions) to authenticated/);
  });
});

describe("responses", () => {
  it("records one answer per question per booking, so a resit overwrites rather than duplicates", () => {
    expect(sql).toMatch(/unique \(booking_id, question_id\)/);
  });

  it("scopes student writes through current_student_profile_id()", () => {
    const policy = sql.slice(sql.indexOf("create policy diagnostic_responses_student_all"));
    expect(policy.slice(0, 300)).toMatch(/current_student_profile_id\(\)/);
  });

  it("gives the buyer no policy at all — results reach them through the tutor", () => {
    expect(sql).not.toMatch(/diagnostic_responses_buyer/);
  });
});

describe("PSAT is offered as a sub-purpose, so it must exist as a set", () => {
  it("seeds it", () => {
    expect(sql).toMatch(/insert into practice_tests \(slug, name\) values \('psat', 'PSAT'\)/);
  });
});

describe("normalizeClassLevel", () => {
  it("treats case and spacing as noise", () => {
    expect(normalizeClassLevel("Algebra 1")).toBe("algebra1");
    expect(normalizeClassLevel("algebra1")).toBe("algebra1");
    expect(normalizeClassLevel(" ALGEBRA  1 ")).toBe("algebra1");
  });

  it("does not conflate different levels", () => {
    expect(normalizeClassLevel("Algebra 1")).not.toBe(normalizeClassLevel("Algebra 2"));
    expect(normalizeClassLevel("Geometry")).not.toBe(normalizeClassLevel("Algebra 1"));
  });

  it("returns null for nothing to match on", () => {
    expect(normalizeClassLevel(null)).toBeNull();
    expect(normalizeClassLevel("   ")).toBeNull();
    expect(normalizeClassLevel("!!")).toBeNull();
  });
});
