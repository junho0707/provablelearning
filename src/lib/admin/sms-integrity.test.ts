import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0011_sms_worklist.sql"), "utf8");

describe("mark_sms_sent — admin-only (AT-SEC-002)", () => {
  it("checks is_admin before writing", () => {
    const fn = sql.slice(sql.indexOf("create function mark_sms_sent"));
    const checkIdx = fn.indexOf("a.is_admin");
    const updateIdx = fn.indexOf("update bookings set sms_sent");
    expect(checkIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(checkIdx);
  });

  it("is granted to authenticated (the admin calls it directly)", () => {
    expect(sql).toMatch(/grant execute on function mark_sms_sent\(uuid\) to authenticated/i);
  });
});

describe("accounts.phone is buyer-settable only for that column", () => {
  it("grants update on exactly the phone column, not the whole row", () => {
    expect(sql).toMatch(/grant update \(phone\) on accounts to authenticated/i);
  });
});
