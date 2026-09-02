import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const availabilitySql = fs.readFileSync(path.join(root, "supabase/migrations/0006_availability.sql"), "utf8");
const bookingsSql = fs.readFileSync(path.join(root, "supabase/migrations/0007_bookings.sql"), "utf8");

// TASK-AVAIL-001/BOOK-001. SQL-text invariant checks — no Docker in this environment, see VERIFY.md.

describe("INV-BOOK-1: at most one live booking per slot", () => {
  it("has a partial unique index on bookings.starts_at excluding cancelled", () => {
    expect(bookingsSql).toMatch(
      /create unique index bookings_one_live_per_slot\s+on bookings \(starts_at\) where \(status <> 'cancelled'\)/i,
    );
  });

  it("book_session serializes on the slot before checking for a conflict", () => {
    const fn = bookingsSql.slice(bookingsSql.indexOf("create function book_session"));
    const lockIdx = fn.indexOf("pg_advisory_xact_lock");
    const checkIdx = fn.indexOf("slot_taken");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeGreaterThan(lockIdx);
  });
});

describe("book_session trusts auth.uid(), never a caller-supplied account id", () => {
  it("derives the account from auth.uid(), not a parameter", () => {
    const fn = bookingsSql.slice(bookingsSql.indexOf("create function book_session"));
    expect(fn).toMatch(/v_account_id uuid := auth\.uid\(\)/);
    expect(fn).not.toMatch(/p_account_id/);
  });

  it("is granted to authenticated, not just service_role (buyers call it directly)", () => {
    expect(bookingsSql).toMatch(/grant execute on function book_session\([^)]*\) to authenticated/i);
  });
});

describe("reservation and spend are one transaction", () => {
  it("book_session spends via spend_credit after inserting, inside the same function body", () => {
    const fn = bookingsSql.slice(
      bookingsSql.indexOf("create function book_session"),
      bookingsSql.indexOf("grant execute"),
    );
    expect(fn).toMatch(/insert into bookings/i);
    expect(fn).toMatch(/perform spend_credit/i);
    // No explicit commit/savepoint between them — a single plpgsql function body is one transaction.
    expect(fn.indexOf("insert into bookings")).toBeLessThan(fn.indexOf("perform spend_credit"));
  });
});

describe("no direct client writes to bookings (NFR-SEC-002)", () => {
  it("grants select-only to authenticated", () => {
    expect(bookingsSql).toMatch(/grant select on bookings to authenticated/i);
    expect(bookingsSql).not.toMatch(/grant (insert|update|delete)[^;]*on bookings to authenticated/i);
  });
});

describe("availability writes are admin-only (F11)", () => {
  it("availability_rules/exceptions require is_admin for insert/update/delete", () => {
    expect(availabilitySql).toMatch(/availability_rules_admin_write on availability_rules for all/i);
    expect(availabilitySql).toMatch(/availability_exceptions_admin_write on availability_exceptions for all/i);
    expect(availabilitySql).toMatch(/a\.is_admin/);
  });
});
