import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0008_booking_lifecycle.sql"), "utf8");

function functionBody(name: string): string {
  const start = sql.indexOf(`create function ${name}`);
  const end = sql.indexOf("create function", start + 1);
  return sql.slice(start, end === -1 ? undefined : end);
}

// TASK-BOOK-002/BOOK-005. SQL-text invariant checks — no Docker in this environment, see VERIFY.md.

describe("cancel_booking — 24h boundary (AT-BOOK-004)", () => {
  const fn = functionBody("cancel_booking");

  it("refunds only when >=24h before start", () => {
    expect(fn).toMatch(/starts_at - now\(\) >= interval '24 hours'/);
  });

  it("is idempotent: an already-cancelled booking returns without a second refund", () => {
    expect(fn).toMatch(/if v_booking\.status = 'cancelled' then\s+return false;/);
  });

  it("locks the row before deciding (FOR UPDATE)", () => {
    expect(fn).toMatch(/for update/i);
  });
});

describe("reschedule_booking — does not touch the ledger (AT-BOOK-005)", () => {
  const fn = functionBody("reschedule_booking");

  it("never references credit_ledger", () => {
    expect(fn).not.toMatch(/credit_ledger/);
  });

  it("requires >=24h notice on the current booking before allowing a reschedule", () => {
    expect(fn).toMatch(/v_booking\.starts_at - now\(\) < interval '24 hours'/);
  });

  it("serializes on the new slot and rejects a conflict, excluding itself", () => {
    expect(fn).toMatch(/pg_advisory_xact_lock/);
    expect(fn).toMatch(/status <> 'cancelled' and id <> p_booking_id/);
  });
});

describe("mark_no_show / resolve_credit_return_request — admin-gated and audited", () => {
  it("mark_no_show checks is_admin before writing", () => {
    const fn = functionBody("mark_no_show");
    const checkIdx = fn.indexOf("a.is_admin");
    const updateIdx = fn.indexOf("update bookings");
    expect(checkIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(checkIdx);
  });

  it("resolve_credit_return_request checks is_admin before writing", () => {
    const fn = functionBody("resolve_credit_return_request");
    const checkIdx = fn.indexOf("a.is_admin");
    const updateIdx = fn.indexOf("update credit_return_requests");
    expect(checkIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(checkIdx);
  });

  it("an approved credit return writes exactly one credit_ledger insert", () => {
    const fn = functionBody("resolve_credit_return_request");
    const matches = fn.match(/insert into credit_ledger/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("both admin actions write an audit_log row", () => {
    expect(functionBody("mark_no_show")).toMatch(/insert into audit_log/);
    expect(functionBody("resolve_credit_return_request")).toMatch(/insert into audit_log/);
  });
});

describe("audit_log is admin-only", () => {
  it("RLS restricts both read and write to is_admin", () => {
    const policy = sql.slice(sql.indexOf("create policy audit_log_admin_only"), sql.indexOf("grant select, insert on audit_log"));
    expect(policy).toMatch(/a\.is_admin/);
    expect(policy).toMatch(/with check/);
  });
});
