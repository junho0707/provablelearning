import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0017_student_logins.sql"), "utf8");
const accountsSql = fs.readFileSync(path.join(root, "supabase/migrations/0003_accounts.sql"), "utf8");

/**
 * SQL-text invariant checks for the consent gate. No Docker in this environment, so these assert
 * the migration *says* what a live database would otherwise enforce — a substitute for exercising
 * Postgres, never a replacement (see `system/07-VERIFY.md`, which marks the real checks [db]).
 *
 * These particular invariants are worth guarding in text because getting them wrong is silent: a
 * student who accidentally gains an `accounts` row looks fine until they can spend money.
 */

describe("INV-ACTOR-1: a student auth user never becomes an account", () => {
  it("the original trigger provisioned an account for every auth user", () => {
    // Establishes the baseline this migration has to change — if 0003 is ever rewritten, this
    // test failing is the signal to re-check that 0017 still overrides it.
    expect(accountsSql).toMatch(/insert into public\.accounts/);
  });

  it("handle_new_user returns early for a student, before the accounts insert", () => {
    const fn = sql.slice(sql.indexOf("create or replace function handle_new_user"));
    const guardIdx = fn.indexOf("is_student");
    const insertIdx = fn.indexOf("insert into public.accounts");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(guardIdx);
  });
});

describe("INV-COPPA-1: student access requires recorded consent", () => {
  it("login_active defaults to false", () => {
    expect(sql).toMatch(/add column login_active boolean not null default false/);
  });

  it("a student may only read their own profile, and only while active", () => {
    expect(sql).toMatch(
      /create policy learner_profiles_select_self on learner_profiles for select using \(\s*auth_user_id = auth\.uid\(\) and login_active\s*\)/,
    );
  });

  it("current_student_profile_id resolves nothing for an inactive login", () => {
    const fn = sql.slice(sql.indexOf("create function current_student_profile_id"));
    expect(fn).toMatch(/auth_user_id = auth\.uid\(\) and login_active/);
  });

  it("only record_consent sets login_active true", () => {
    const activations = sql.match(/set login_active = true/g) ?? [];
    expect(activations).toHaveLength(1);
    const fn = sql.slice(sql.indexOf("create function record_consent"), sql.indexOf("create function revoke_consent"));
    expect(fn).toMatch(/set login_active = true/);
  });
});

describe("INV-AUTH-1: only the buyer controls a student's credentials", () => {
  it("gives students no update policy on their own profile row", () => {
    expect(sql).not.toMatch(/create policy \w+ on learner_profiles for update using \(\s*auth_user_id/);
  });

  it("revoke_consent checks the caller owns the profile", () => {
    const fn = sql.slice(sql.indexOf("create function revoke_consent"));
    expect(fn).toMatch(/account_id = v_account_id/);
    expect(fn).toMatch(/raise exception 'denied'/);
  });
});

describe("consent is recorded, not inferred", () => {
  it("records the mechanism and the purchase that established it", () => {
    expect(sql).toMatch(/mechanism\s+text not null check \(mechanism in \('stripe_payment', 'admin'\)\)/);
    expect(sql).toMatch(/purchase_id\s+uuid references purchases \(id\)/);
  });

  it("treats revocation as an event rather than a deletion", () => {
    expect(sql).toMatch(/event\s+text not null check \(event in \('granted', 'revoked'\)\)/);
    const fn = sql.slice(sql.indexOf("create function revoke_consent"));
    expect(fn).toMatch(/insert into consent_events/);
    expect(fn).not.toMatch(/delete from consent_events/);
  });

  it("record_consent is idempotent, so a replayed webhook writes one event", () => {
    const fn = sql.slice(sql.indexOf("create function record_consent"), sql.indexOf("create function revoke_consent"));
    expect(fn).toMatch(/if not exists \(/);
  });

  it("record_consent is service-role only — a buyer cannot grant their own consent", () => {
    expect(sql).toMatch(/grant execute on function record_consent\(uuid, uuid\) to service_role/);
    expect(sql).not.toMatch(/grant execute on function record_consent\(uuid, uuid\) to authenticated/);
  });
});

describe("the old purpose vocabulary is migrated, not abandoned", () => {
  it("carries existing purposes into the new columns before dropping the column", () => {
    const updateIdx = sql.indexOf("set primary_purpose = purposes[1]");
    const dropIdx = sql.indexOf("drop column purposes");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(dropIdx).toBeGreaterThan(updateIdx);
  });

  it("drops the constraint that limited purposes to the old three modes", () => {
    expect(sql).toMatch(/drop constraint if exists learner_profiles_purposes_valid/);
  });
});
