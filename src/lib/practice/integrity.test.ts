import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAllLessons } from "@/lib/content/catalog";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("answer secret is not exposed to the client (AT-PRACTICE-005, NFR-SEC-001)", () => {
  it("migration grants public roles only presentational columns", () => {
    const sql = read("supabase/migrations/0002_questions.sql");
    // Public column grant must exclude the answer secret and explanation.
    const grant = sql.match(/grant select \(([^)]*)\) on questions to anon, authenticated/i);
    expect(grant, "column-level grant to anon/authenticated not found").not.toBeNull();
    const cols = grant![1].split(",").map((c) => c.trim());
    expect(cols).toContain("prompt");
    expect(cols).toContain("choices");
    expect(cols).not.toContain("answer");
    expect(cols).not.toContain("tolerance");
    expect(cols).not.toContain("explanation");
    // And a blanket revoke precedes it, so no default column access leaks.
    expect(sql).toMatch(/revoke all on questions from anon, authenticated/i);
  });

  it("the public questions read never selects the answer secret", () => {
    const src = read("src/lib/practice/questions.ts");
    const select = src.match(/\.select\(\s*"([^"]*)"/);
    expect(select).not.toBeNull();
    expect(select![1]).not.toMatch(/answer|tolerance|explanation/);
  });
});

describe("slug integrity: seeded questions reference real lessons (ADR-001 follow-up)", () => {
  it("every seeded question lesson_slug matches an in-repo MDX lesson", () => {
    const seed = read("supabase/seed.sql");
    // Each question row begins `('<lesson-slug>', <position>, ...`.
    const slugs = [...seed.matchAll(/^\s*\('([a-z0-9-]+)',\s*\d+,/gm)].map((m) => m[1]);
    expect(slugs.length).toBeGreaterThan(0);

    const known = new Set(getAllLessons().map((l) => l.slug));
    const orphans = slugs.filter((s) => !known.has(s));
    expect(orphans, `seeded questions reference non-existent lessons: ${orphans.join(", ")}`).toEqual(
      [],
    );
  });
});
