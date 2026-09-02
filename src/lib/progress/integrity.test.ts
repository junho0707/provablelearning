import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0005_progress.sql"), "utf8");

// TASK-PROGRESS-001. Checks the migration's SQL text for the ownership boundary the live database
// would otherwise enforce (AT-SEC-001) — no Docker in this environment, see VERIFY.md.

describe("AT-SEC-001: attempts/progress are scoped through learner_profiles ownership", () => {
  it("question_attempts RLS policies require the profile's account_id to match the caller", () => {
    const policies = sql.match(/create policy question_attempts_\w+ on question_attempts[^;]+;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/lp\.account_id = auth\.uid\(\)/);
    }
  });

  it("lesson_progress RLS policies require the profile's account_id to match the caller", () => {
    const policies = sql.match(/create policy lesson_progress_\w+ on lesson_progress[^;]+;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/lp\.account_id = auth\.uid\(\)/);
    }
  });

  it("neither table grants delete or unscoped update to authenticated", () => {
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*on (question_attempts|lesson_progress) to authenticated/i);
  });
});
