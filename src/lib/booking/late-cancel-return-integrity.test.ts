import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/0015_late_cancel_credit_return.sql"),
  "utf8",
);

// ADR-006. SQL-text invariant checks — no Docker in this environment, see VERIFY.md.

describe("request_credit_return — late cancels are appealable (ADR-006)", () => {
  it("replaces the function rather than creating a second one", () => {
    expect(sql).toMatch(/create or replace function request_credit_return/);
  });

  it("still accepts a no_show", () => {
    expect(sql).toMatch(/b\.status = 'no_show'/);
  });

  it("accepts a cancelled booking only when no cancel_refund row exists", () => {
    // The credit was burned iff the ≥24h refund never happened — see cancel_booking in 0008.
    expect(sql).toMatch(/b\.status = 'cancelled'/);
    expect(sql).toMatch(/not exists[\s\S]*?credit_ledger[\s\S]*?reason = 'cancel_refund'/);
  });

  it("scopes eligibility to the caller's own booking", () => {
    expect(sql).toMatch(/b\.account_id = v_account_id/);
  });

  it("blocks a second live appeal but allows resubmitting a denied one", () => {
    expect(sql).toMatch(/status in \('pending', 'approved'\)/);
    expect(sql).not.toMatch(/status in \('pending', 'approved', 'denied'\)/);
  });

  it("keeps the grant, so replacing the function doesn't revoke access", () => {
    expect(sql).toMatch(/grant execute on function request_credit_return\(uuid, text\) to authenticated/);
  });
});
