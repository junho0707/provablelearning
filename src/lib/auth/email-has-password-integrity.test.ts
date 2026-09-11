import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/0026_email_has_password.sql"),
  "utf8",
);

/** SQL-text checks for the email-first sign-in lookup. Live equivalent is `AT-AUTH-3`. */

describe("email_has_password", () => {
  it("reads auth.users through security definer, since PostgREST cannot", () => {
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/from auth\.users/);
  });

  it("excludes student identities, so it cannot confirm a student exists (INV-AUTH-2)", () => {
    expect(sql).toMatch(/email not like '%\.invalid'/);
  });

  it("treats an empty password hash as no password, not as a password", () => {
    expect(sql).toMatch(/encrypted_password is not null/);
    expect(sql).toMatch(/encrypted_password <> ''/);
  });

  it("returns only a boolean — never a row from auth.users", () => {
    expect(sql).toMatch(/returns boolean/);
    expect(sql).toMatch(/select exists \(/);
  });

  it("is callable by a signed-out visitor, which is the whole point", () => {
    expect(sql).toMatch(/grant execute on function email_has_password\(text\) to anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function email_has_password\(text\) from public;/);
  });
});
