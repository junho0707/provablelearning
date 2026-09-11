import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0010_admin.sql"), "utf8");

// TASK-ADMIN-001. SQL-text invariant checks — no Docker in this environment, see VERIFY.md.

describe("admin cross-account read policies (AT-SEC-002)", () => {
  for (const table of ["accounts", "learner_profiles", "bookings", "purchases", "credit_ledger"]) {
    it(`${table} has an admin-read policy gated on is_admin`, () => {
      const policy = sql.match(new RegExp(`create policy ${table}_admin_read on ${table} for select using \\(([^;]+)\\);`, "s"));
      expect(policy).not.toBeNull();
      expect(policy![1]).toMatch(/a\.is_admin/);
    });
  }
});

describe("refund_credit — admin-only, audited (F13)", () => {
  const fn = sql.slice(sql.indexOf("create function refund_credit"));

  it("checks is_admin before writing", () => {
    const checkIdx = fn.indexOf("a.is_admin");
    const insertIdx = fn.indexOf("insert into credit_ledger");
    expect(checkIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(checkIdx);
  });

  it("writes exactly one credit_ledger row with reason admin_adjust", () => {
    const matches = fn.match(/insert into credit_ledger/g) ?? [];
    expect(matches.length).toBe(1);
    expect(fn).toMatch(/'admin_adjust'/);
  });

  it("writes an audit_log row", () => {
    expect(fn).toMatch(/insert into audit_log/);
  });

  it("is granted to authenticated, not just service_role (the admin calls it directly)", () => {
    expect(sql).toMatch(/grant execute on function refund_credit\([^)]*\) to authenticated/i);
  });
});

// F11. RLS said the admin may write availability; the table grants said `select` only, so every
// "Add rule" click died on a Postgres privilege error before RLS was ever consulted.
describe("availability writes (F11)", () => {
  const availabilitySql = ["0006_availability.sql", "0028_availability_admin_writes.sql"]
    .map((file) => fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8"))
    .join("\n");

  function grantsTo(table: string, role: string) {
    const statements = availabilitySql.match(/grant [^;]+;/gi) ?? [];
    return statements
      .filter((s) => new RegExp(`\\b${table}\\b`).test(s) && new RegExp(`to [^;]*\\b${role}\\b`, "i").test(s))
      .join(" ")
      .toLowerCase();
  }

  for (const table of ["availability_rules", "availability_exceptions"]) {
    it(`${table} grants insert and update to authenticated — the admin writes it directly`, () => {
      const granted = grantsTo(table, "authenticated");
      expect(granted).toMatch(/\binsert\b/);
      expect(granted).toMatch(/\bupdate\b/);
    });

    it(`${table} still gates those writes on is_admin`, () => {
      expect(availabilitySql).toMatch(
        new RegExp(`create policy ${table}_admin_write on ${table} for all[^;]+a\\.is_admin`, "s"),
      );
    });
  }
});
