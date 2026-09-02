import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/0022_messages.sql"),
  "utf8",
);

/** SQL-text checks for R6. The live equivalents are `AT-MSG-1` and `AT-MSG-2`. */

describe("INV-ACTOR-1: students have no messaging at all", () => {
  it("defines no student policy on messages", () => {
    expect(sql).not.toMatch(/current_student_profile_id\(\)/);
    expect(sql).not.toMatch(/learner_profiles/);
  });

  it("scopes every buyer policy to the caller's own account row", () => {
    const policies = sql.match(/create policy messages_buyer_\w+[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(3);
    for (const policy of policies) expect(policy).toMatch(/account_id = auth\.uid\(\)/);
  });
});

describe("a buyer cannot forge a message from the tutor", () => {
  it("pins the sender on insert", () => {
    const insert = sql.slice(sql.indexOf("create policy messages_buyer_insert"));
    expect(insert.slice(0, 200)).toMatch(/sender = 'buyer'/);
  });

  it("constrains sender to the two parties", () => {
    expect(sql).toMatch(/check \(sender in \('buyer', 'tutor'\)\)/);
  });
});

describe("RLS is on and the admin can work every thread", () => {
  it("enables row level security", () => {
    expect(sql).toMatch(/alter table messages enable row level security/);
  });

  it("gives the admin full access through is_admin", () => {
    const policy = sql.slice(sql.indexOf("create policy messages_admin_all"));
    expect(policy.slice(0, 300)).toMatch(/a\.is_admin/);
  });

  it("never grants delete to authenticated — a thread is a record, not a draft", () => {
    expect(sql).toMatch(/grant select, insert, update on messages to authenticated/);
    expect(sql).not.toMatch(/grant all on messages to authenticated/);
  });
});
