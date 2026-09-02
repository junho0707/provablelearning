import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/0018_first_session_per_student.sql"),
  "utf8",
);

/**
 * SQL-text invariant checks for ADR-007 §4 and the consent linkage. The live equivalents are
 * `AT-MONEY-3/4` and `AT-COPPA-2` in `system/07-VERIFY.md`, both marked [db]/[live].
 */

describe("INV-FIRST-1: one First Session per student, not per account", () => {
  it("scopes the unique index to the profile", () => {
    expect(sql).toMatch(
      /create unique index purchases_one_first_session_per_profile\s+on purchases \(profile_id\) where \(sku = 'first_session'\)/i,
    );
  });

  it("drops the old per-account constraint rather than leaving both in force", () => {
    // Leaving the account-scoped index would silently keep the old rule and make a second
    // student's purchase fail — the exact bug this decision was meant to remove.
    expect(sql).toMatch(/drop index if exists purchases_one_first_session_per_account/);
  });

  it("requires a First Session purchase to name a student and a purpose", () => {
    expect(sql).toMatch(/sku <> 'first_session'\s*or \(profile_id is not null and purpose is not null\)/);
  });

  it("book_first_session requires the purchase to belong to that same student", () => {
    const fn = sql.slice(sql.indexOf("create or replace function book_first_session"));
    expect(fn).toMatch(/and profile_id = p_profile_id/);
  });

  it("book_first_session still spends no credit", () => {
    const fn = sql.slice(sql.indexOf("create or replace function book_first_session"));
    expect(fn).not.toMatch(/spend_credit/);
  });
});

describe("AT-COPPA-2: a purchase records consent in the same transaction", () => {
  it("process_purchase calls record_consent", () => {
    const fn = sql.slice(sql.indexOf("create function process_purchase"));
    expect(fn).toMatch(/perform record_consent\(p_account_id, v_purchase_id\)/);
  });

  it("records consent for any purchase, not only a First Session", () => {
    const fn = sql.slice(sql.indexOf("create function process_purchase"));
    const consentIdx = fn.indexOf("record_consent");
    const guarded = fn.slice(0, consentIdx).match(/if p_sku = 'first_session'/);
    expect(guarded).toBeNull();
  });

  it("keeps the idempotency guard ahead of everything it protects (INV-MONEY-3)", () => {
    const fn = sql.slice(sql.indexOf("create function process_purchase"));
    const guardIdx = fn.indexOf("insert into stripe_events");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(fn.indexOf("insert into purchases")).toBeGreaterThan(guardIdx);
    expect(fn.indexOf("record_consent")).toBeGreaterThan(guardIdx);
  });

  it("stays service-role only", () => {
    expect(sql).toMatch(/grant execute on function process_purchase\([^)]*\) to service_role/);
    expect(sql).not.toMatch(/grant execute on function process_purchase\([^)]*\) to authenticated/);
  });
});

describe("the purpose vocabulary is open", () => {
  it("drops the old three-value check on the goal column", () => {
    expect(sql).toMatch(/drop constraint if exists purchases_goal_check/);
  });

  it("renames goal to purpose rather than adding a parallel column", () => {
    expect(sql).toMatch(/alter table purchases rename column goal to purpose/);
  });
});
