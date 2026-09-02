import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0004_credits.sql"), "utf8");

// TASK-CREDIT-001. These check the migration's SQL text for the invariants the live database
// would otherwise enforce (INV-MONEY-1/2/3) — no Docker in this environment, see VERIFY.md.

describe("INV-MONEY-2: at most one First Session purchase per account", () => {
  it("has a partial unique index on purchases scoped to sku = 'first_session'", () => {
    expect(sql).toMatch(
      /create unique index purchases_one_first_session_per_account\s+on purchases \(account_id\) where \(sku = 'first_session'\)/i,
    );
  });
});

describe("INV-MONEY-3: webhook redelivery is a no-op", () => {
  it("stripe_events.event_id is the primary key (insert-first idempotency guard)", () => {
    expect(sql).toMatch(/event_id\s+text primary key/i);
  });

  it("process_purchase returns early on a unique_violation instead of double-crediting", () => {
    const fn = sql.slice(sql.indexOf("create function process_purchase"));
    expect(fn).toMatch(/exception when unique_violation then\s+return false;/i);
  });
});

describe("INV-MONEY-1: balance never goes negative under concurrent spend", () => {
  it("spend_credit serializes concurrent spends per account before checking the balance", () => {
    const fn = sql.slice(sql.indexOf("create function spend_credit"), sql.indexOf("create function process_purchase"));
    const lockIdx = fn.indexOf("pg_advisory_xact_lock");
    const checkIdx = fn.indexOf("if v_balance < 1");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeGreaterThan(lockIdx);
  });

  it("raises rather than inserting when balance is insufficient", () => {
    const fn = sql.slice(sql.indexOf("create function spend_credit"), sql.indexOf("create function process_purchase"));
    expect(fn).toMatch(/raise exception 'insufficient_credits'/i);
  });
});

describe("no direct client writes to money tables (NFR-SEC-002)", () => {
  it("grants select-only to authenticated on purchases and credit_ledger", () => {
    expect(sql).toMatch(/grant select on purchases to authenticated/i);
    expect(sql).toMatch(/grant select on credit_ledger to authenticated/i);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*on (purchases|credit_ledger) to authenticated/i);
  });
});
