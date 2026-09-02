import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0013_first_session.sql"), "utf8");

// TASK-FIRST-001/003. SQL-text invariant checks — no Docker in this environment, see VERIFY.md.

describe("class_help has no assessment at all (ADR-005)", () => {
  it("the mode check constraint excludes class_help", () => {
    expect(sql).toMatch(/mode\s+text not null check \(mode in \('strengths', 'test_prep'\)\)/i);
  });
});

describe("book_first_session never spends a credit", () => {
  it("never references spend_credit or credit_ledger", () => {
    const fn = sql.slice(sql.indexOf("create function book_first_session"));
    expect(fn).not.toMatch(/spend_credit|credit_ledger/);
  });

  it("validates the purchase is the caller's own unused first_session purchase", () => {
    const fn = sql.slice(sql.indexOf("create function book_first_session"));
    expect(fn).toMatch(/sku = 'first_session'/);
    expect(fn).toMatch(/exists \(select 1 from bookings where purchase_id = p_purchase_id\)/);
  });

  it("serializes on the slot like book_session (INV-BOOK-1)", () => {
    const fn = sql.slice(sql.indexOf("create function book_first_session"));
    const lockIdx = fn.indexOf("pg_advisory_xact_lock");
    const checkIdx = fn.indexOf("slot_taken");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeGreaterThan(lockIdx);
  });
});

describe("at most one assessment per First Session purchase", () => {
  it("has a unique index on assessments.purchase_id", () => {
    expect(sql).toMatch(/create unique index assessments_one_per_purchase on assessments \(purchase_id\)/i);
  });
});
