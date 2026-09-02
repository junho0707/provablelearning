import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0012_test_prep.sql"), "utf8");

// TASK-FIRST-004. Mirrors src/lib/practice/integrity.test.ts's checks for `questions`.

describe("test_prep_questions answer secrecy (AT-PRACTICE-005 pattern)", () => {
  it("column-level grant to anon/authenticated excludes the answer secret", () => {
    const grant = sql.match(/grant select \(([^)]*)\) on test_prep_questions to anon, authenticated/i);
    expect(grant).not.toBeNull();
    const cols = grant![1].split(",").map((c) => c.trim());
    expect(cols).toContain("prompt");
    expect(cols).not.toContain("answer");
    expect(cols).not.toContain("tolerance");
    expect(cols).not.toContain("explanation");
    expect(sql).toMatch(/revoke all on test_prep_questions from anon, authenticated/i);
  });
});

describe("seeded practice tests", () => {
  it("includes sat and act", () => {
    expect(sql).toMatch(/insert into practice_tests \(slug, name\) values \('sat', 'SAT'\), \('act', 'ACT'\)/i);
  });
});
