import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/0019_booking_purpose_and_windows.sql"),
  "utf8",
);

/** SQL-text checks for ADR-007 §5/§6/§8. Live equivalents are `AT-BOOK-3/4/5` and `AT-CANCEL-*`. */

describe("INV-BOOK-3: 6-hour floor, 1-hour floor for released slots", () => {
  it("slot_min_notice returns 1 hour only for a released slot", () => {
    const fn = sql.slice(sql.indexOf("create function slot_min_notice"));
    expect(fn).toMatch(/from released_slots where starts_at = p_starts_at/);
    expect(fn).toMatch(/then interval '1 hour'/);
    expect(fn).toMatch(/else interval '6 hours'/);
  });

  it("both booking functions check the floor through slot_min_notice, not a literal", () => {
    for (const name of ["create function book_session", "create or replace function book_first_session"]) {
      const fn = sql.slice(sql.indexOf(name));
      expect(fn).toMatch(/p_starts_at - now\(\) < slot_min_notice\(p_starts_at\)/);
    }
  });

  it("both booking functions enforce the horizon", () => {
    for (const name of ["create function book_session", "create or replace function book_first_session"]) {
      const fn = sql.slice(sql.indexOf(name));
      expect(fn).toMatch(/p_starts_at > booking_horizon_end\(\)/);
    }
  });

  it("the horizon steps on Monday, matching horizonEnd() in slots.ts", () => {
    const fn = sql.slice(sql.indexOf("create function booking_horizon_end"));
    expect(fn).toMatch(/date_trunc\('week', now\(\) at time zone 'utc'\) \+ interval '28 days'/);
  });
});

describe("cancellation returns the hour to the calendar", () => {
  it("cancel_booking records the freed slot", () => {
    const fn = sql.slice(sql.indexOf("create or replace function cancel_booking"));
    expect(fn).toMatch(/insert into released_slots \(starts_at\)/);
  });

  it("cancel_booking refunds at 6 hours, not 24", () => {
    const fn = sql.slice(sql.indexOf("create or replace function cancel_booking"));
    expect(fn).toMatch(/starts_at - now\(\) >= interval '6 hours'/);
    expect(fn).not.toMatch(/interval '24 hours'/);
  });

  it("booking a released slot consumes its released status", () => {
    const fn = sql.slice(sql.indexOf("create function book_session"), sql.indexOf("grant execute on function book_session"));
    expect(fn).toMatch(/delete from released_slots where starts_at = p_starts_at/);
  });

  it("released slots are their own table, not placeholder bookings", () => {
    // A cancelled placeholder booking would appear in the buyer's own session list.
    expect(sql).toMatch(/create table released_slots/);
    const fn = sql.slice(sql.indexOf("create or replace function reschedule_booking"));
    expect(fn).not.toMatch(/insert into bookings/);
  });
});

describe("reschedule still never touches the ledger", () => {
  it("moves the slot without writing a credit row", () => {
    const fn = sql.slice(sql.indexOf("create or replace function reschedule_booking"));
    expect(fn).toMatch(/update bookings set starts_at = p_new_starts_at/);
    expect(fn).not.toMatch(/credit_ledger/);
    expect(fn).not.toMatch(/spend_credit/);
  });

  it("frees the old instant and un-frees the new one", () => {
    const fn = sql.slice(sql.indexOf("create or replace function reschedule_booking"));
    expect(fn).toMatch(/insert into released_slots \(starts_at\) values \(v_booking\.starts_at\)/);
    expect(fn).toMatch(/delete from released_slots where starts_at = p_new_starts_at/);
  });

  it("requires 6 hours' notice on the existing booking", () => {
    const fn = sql.slice(sql.indexOf("create or replace function reschedule_booking"));
    expect(fn).toMatch(/v_booking\.starts_at - now\(\) < interval '6 hours'/);
  });
});

describe("every booking captures what it is for (F5)", () => {
  it("stores purpose, sub-purpose, specifics and topic mode", () => {
    expect(sql).toMatch(/add column purpose\s+text/);
    expect(sql).toMatch(/add column sub_purpose\s+text/);
    expect(sql).toMatch(/add column specifics\s+text/);
    expect(sql).toMatch(/add column topic_mode\s+text check \(topic_mode in \('new', 'continue'\)\)/);
  });

  it("book_session refuses a booking with no purpose", () => {
    const fn = sql.slice(sql.indexOf("create function book_session"));
    expect(fn).toMatch(/raise exception 'purpose_required'/);
  });

  it("a First Session carries the purpose stated at purchase rather than asking again", () => {
    const fn = sql.slice(sql.indexOf("create or replace function book_first_session"));
    expect(fn).toMatch(/v_purchase\.purpose, v_purchase\.sub_purpose/);
  });

  it("book_session still spends a credit in the same transaction (INV-MONEY-1)", () => {
    const fn = sql.slice(sql.indexOf("create function book_session"));
    expect(fn).toMatch(/perform spend_credit\(v_account_id, 'booking_spend', v_booking_id\)/);
  });
});
