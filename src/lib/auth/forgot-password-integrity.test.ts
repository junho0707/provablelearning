import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const action = fs.readFileSync(path.join(process.cwd(), "src/lib/auth/actions.ts"), "utf8");
const form = fs.readFileSync(
  path.join(process.cwd(), "src/components/auth/email-sign-in-form.tsx"),
  "utf8",
);

/**
 * Source-text checks for the way back out of a password. `email_has_password` keeps answering true
 * once a password is set, so the password box is the only step that address ever reaches — which
 * makes "Forgot password?" the sole exit. Live equivalent is `AT-AUTH-7`.
 */

describe("forgot password", () => {
  it("takes the link branch instead of the password branch", () => {
    expect(action).toMatch(/if \(password && !forgot\)/);
  });

  it("skips the has-password gate, which would otherwise send them back to the password box", () => {
    expect(action).toMatch(/if \(!forgot\) \{[\s\S]*?email_has_password[\s\S]*?\}/);
  });

  it("lands the link on set-password, since the callback only offers that page unprompted", () => {
    expect(action).toMatch(/forgot \?[\s\S]*?\/set-password\?next=/);
  });

  it("is a submit button, so it re-posts the email the server already resolved", () => {
    expect(form).toMatch(/name="forgot"/);
    expect(form).toMatch(/type="submit"[\s\S]*?name="forgot"/);
  });

  it("skips validation, because it posts the form with the password left empty", () => {
    expect(form).toMatch(/formNoValidate/);
  });

  it("is offered only on the password step — there is nothing to forget on step one", () => {
    expect(form).toMatch(/\{knownEmail && \([\s\S]*?name="forgot"/);
  });
});
