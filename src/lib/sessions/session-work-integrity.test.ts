import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/0020_session_work.sql"),
  "utf8",
);

/** SQL-text checks for R4. Live equivalents are `AT-PRE-*`, `AT-POST-*` and `AT-ACTOR-1`. */

describe("INV-ACTOR-1: students see sessions without reading bookings", () => {
  it("exposes sessions through a view, not a policy on bookings", () => {
    expect(sql).toMatch(/create view student_sessions/);
    expect(sql).not.toMatch(/create policy \w+ on bookings/);
  });

  it("the view scopes rows to the signed-in, consented student", () => {
    const view = sql.slice(sql.indexOf("create view student_sessions"), sql.indexOf("grant select on student_sessions"));
    expect(view).toMatch(/where p\.auth_user_id = auth\.uid\(\)/);
    expect(view).toMatch(/and p\.login_active/);
  });

  it("the view exposes no account, purchase or credit column", () => {
    const view = sql.slice(sql.indexOf("create view student_sessions"), sql.indexOf("grant select on student_sessions"));
    expect(view).not.toMatch(/account_id/);
    expect(view).not.toMatch(/purchase_id/);
  });
});

describe("INV-COPPA-1: student writes require an active login", () => {
  it("every student policy routes through current_student_profile_id()", () => {
    for (const policy of [
      "pre_session_student_all",
      "uploads_student_all",
      "materials_student_read",
      "material_progress_student_all",
    ]) {
      const idx = sql.indexOf(policy);
      expect(idx, `${policy} missing`).toBeGreaterThan(-1);
      expect(sql.slice(idx, idx + 400)).toMatch(/current_student_profile_id\(\)/);
    }
  });
});

describe("answer secrecy on practice questions", () => {
  it("withholds the answer column from authenticated", () => {
    expect(sql).toMatch(
      /grant select \(id, material_id, position, prompt, explanation, created_at\) on material_items to authenticated/,
    );
  });

  it("never grants the whole table to authenticated", () => {
    expect(sql).not.toMatch(/grant select on material_items to authenticated/);
    expect(sql).not.toMatch(/grant all on material_items to authenticated/);
  });
});

describe("students see only published material", () => {
  it("the student read policy requires published_at", () => {
    const idx = sql.indexOf("create policy materials_student_read");
    expect(sql.slice(idx, idx + 300)).toMatch(/published_at is not null/);
  });

  it("the buyer may see it regardless, since it was delivered to their student", () => {
    const idx = sql.indexOf("create policy materials_buyer_read");
    expect(sql.slice(idx, idx + 300)).not.toMatch(/published_at/);
  });
});

describe("uploads", () => {
  it("are keyed by profile id, which is what makes deletion exhaustive (AT-COPPA-5)", () => {
    expect(sql).toMatch(/profile_id\s+uuid not null references learner_profiles \(id\) on delete cascade/);
    expect(sql).toMatch(/create index session_uploads_profile_idx on session_uploads \(profile_id\)/);
  });

  it("hold exactly one of a file or a link", () => {
    expect(sql).toMatch(/check \(\(storage_path is not null\) <> \(link_url is not null\)\)/);
  });

  it("live in a private bucket", () => {
    expect(sql).toMatch(/insert into storage\.buckets \(id, name, public\)\s*\n\s*values \('session-uploads', 'session-uploads', false\)/);
  });
});

describe("progress is recorded per student per question", () => {
  it("is unique on the pair, so re-answering updates rather than duplicates", () => {
    expect(sql).toMatch(/unique \(material_item_id, profile_id\)/);
  });
});
