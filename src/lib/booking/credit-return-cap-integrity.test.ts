import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/0021_credit_return_cap.sql"),
  "utf8",
);

/** SQL-text checks for INV-CREDIT-2. Live equivalents are `AT-CANCEL-9/10/11/12`. */

describe("INV-CREDIT-2: 2 per calendar month, per student, combined", () => {
  it("counts per student, not per account", () => {
    const fn = sql.slice(
      sql.indexOf("create function credit_returns_used"),
      sql.indexOf("create function credit_return_allowance"),
    );
    expect(fn).toMatch(/b\.profile_id = p_profile_id/);
    expect(fn).not.toMatch(/account_id/);
  });

  it("counts both causes against the same allowance", () => {
    // No filter on booking status or ledger reason — a late cancel and a no-show both count.
    const fn = sql.slice(
      sql.indexOf("create function credit_returns_used"),
      sql.indexOf("create function credit_return_allowance"),
    );
    expect(fn).not.toMatch(/status = 'no_show'/);
    expect(fn).toMatch(/r\.status = 'approved'/);
  });

  it("counts by the month the session was in, not when it was approved", () => {
    // Otherwise a slow approval would consume the next month's allowance.
    const fn = sql.slice(sql.indexOf("create function credit_returns_used"));
    expect(fn).toMatch(/date_trunc\('month', b\.starts_at\) = date_trunc\('month', p_at\)/);
    expect(fn).not.toMatch(/date_trunc\('month', r\.resolved_at\)/);
  });

  it("counts only approved requests", () => {
    const fn = sql.slice(
      sql.indexOf("create function credit_returns_used"),
      sql.indexOf("create function credit_return_allowance"),
    );
    expect(fn).toMatch(/r\.status = 'approved'/);
  });
});

describe("the cap is enforced in the database, at both ends", () => {
  it("refuses to create a request once the cap is used", () => {
    const fn = sql.slice(
      sql.indexOf("create or replace function request_credit_return"),
      sql.indexOf("create or replace function resolve_credit_return_request"),
    );
    expect(fn).toMatch(/credit_returns_used\(v_booking\.profile_id, v_booking\.starts_at\) >= 2/);
    expect(fn).toMatch(/raise exception 'cap_reached'/);
  });

  it("re-checks at approval, which is what actually enforces the limit", () => {
    // Several requests can be pending at once; approving them one by one would otherwise walk
    // past the cap.
    const fn = sql.slice(sql.indexOf("create or replace function resolve_credit_return_request"));
    expect(fn).toMatch(/credit_returns_used\(v_booking\.profile_id, v_booking\.starts_at\) >= 2/);
    expect(fn).toMatch(/raise exception 'cap_reached'/);
  });

  it("only writes a ledger row on approval", () => {
    const fn = sql.slice(sql.indexOf("create or replace function resolve_credit_return_request"));
    const approvalBlock = fn.slice(fn.indexOf("if p_decision = 'approved'"));
    expect(approvalBlock).toMatch(/insert into credit_ledger/);
  });

  it("still requires an admin to resolve", () => {
    const fn = sql.slice(sql.indexOf("create or replace function resolve_credit_return_request"));
    expect(fn).toMatch(/a\.is_admin/);
    expect(fn).toMatch(/raise exception 'denied'/);
  });
});

describe("INV-CREDIT-1: a booking's credit is returned at most once", () => {
  it("allows one live request per booking, and lets a denied one be resubmitted", () => {
    const fn = sql.slice(
      sql.indexOf("create or replace function request_credit_return"),
      sql.indexOf("create or replace function resolve_credit_return_request"),
    );
    expect(fn).toMatch(/status in \('pending', 'approved'\)/);
    expect(fn).toMatch(/raise exception 'already_requested'/);
  });
});

describe("eligibility is unchanged: the credit must actually have been burned", () => {
  it("accepts a no-show, or a cancellation with no refund row", () => {
    const fn = sql.slice(sql.indexOf("create or replace function request_credit_return"));
    expect(fn).toMatch(/b\.status = 'no_show'/);
    expect(fn).toMatch(/l\.reason = 'cancel_refund'/);
  });
});
