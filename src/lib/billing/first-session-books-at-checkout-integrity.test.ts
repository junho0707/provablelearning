import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/0027_first_session_books_at_checkout.sql"),
  "utf8",
);

/**
 * SQL-text checks for ADR-009. The live equivalents are `AT-BOOK-9` and `AT-MONEY-5`; these only
 * prove the migration *says* what a real database would enforce.
 */

const forAccount = sql.slice(sql.indexOf("create or replace function book_first_session_for_account"));

describe("ADR-009: the webhook books the slot the buyer picked", () => {
  it("takes the account as a parameter rather than reading auth.uid()", () => {
    expect(forAccount.slice(0, forAccount.indexOf("$$;"))).not.toMatch(/auth\.uid\(\)/);
    expect(forAccount).toMatch(/p_account_id\s+uuid/);
  });

  it("still proves ownership of the student and the purchase against that account", () => {
    expect(forAccount).toMatch(/from learner_profiles where id = p_profile_id and account_id = p_account_id/);
    expect(forAccount).toMatch(/and account_id = p_account_id/);
    expect(forAccount).toMatch(/sku = 'first_session'/);
  });

  it("keeps every guard the authenticated path had", () => {
    for (const guard of ["already_booked", "slot_taken", "too_soon", "beyond_horizon"]) {
      expect(forAccount).toContain(guard);
    }
    expect(forAccount).toMatch(/pg_advisory_xact_lock/);
  });

  it("is reachable only by service_role — a buyer cannot name someone else's account", () => {
    expect(sql).toMatch(
      /revoke execute on function book_first_session_for_account\(uuid, uuid, timestamptz, uuid, text\) from public/,
    );
    expect(sql).toMatch(
      /grant execute on function book_first_session_for_account\(uuid, uuid, timestamptz, uuid, text\) to service_role/,
    );
    expect(sql).not.toMatch(
      /grant execute on function book_first_session_for_account\([^)]*\) to authenticated/,
    );
  });

  it("leaves the buyer-facing entry point in place, delegating with auth.uid()", () => {
    const authed = sql.slice(sql.lastIndexOf("create or replace function book_first_session("));
    expect(authed).toMatch(/book_first_session_for_account\(auth\.uid\(\)/);
    expect(sql).toMatch(/grant execute on function book_first_session\(uuid, timestamptz, uuid, text\) to authenticated/);
  });
});
