-- 0023_diagnostics — the diagnostic skeleton (ADR-007 §14, system/08-BUILD-PLAN.md R7).
--
-- **The skeleton, not the content.** Diagnostics are hand-authored afterwards, at whatever pace
-- suits, and a purpose may be sold before its diagnostic exists. Everything here is built so that
-- authoring one is data entry and *not* authoring one is harmless: a missing diagnostic degrades
-- to the descriptive pre-session questions and never blocks a session (AT-PRE-7).
--
-- `practice_tests` (0012) already had the right shape — a hand-authored, fixed, ordered set with
-- its answers behind a column-privilege wall. It is extended here rather than duplicated, because
-- a math diagnostic keyed by class level is the same object as an SAT set keyed by test slug; only
-- the key differs.
--
-- `probe.ts`'s algorithmic descend is *not* what this is. That approach was shelved by ADR-007 in
-- favour of a fixed set per level, authored once.

-- What this set is keyed by. `test_prep` sets are found by sub-purpose (`psat`/`sat`/`act`);
-- `math_diagnostic` sets are found by the student's current class level.
alter table practice_tests add column kind text not null default 'test_prep'
  check (kind in ('test_prep', 'math_diagnostic'));

-- Null for a test-prep set. Stored normalized (lowercased, alphanumeric only) so that "Algebra 1"
-- and "algebra 1" are the same level; anything a student types that does not normalize onto an
-- authored level simply finds no diagnostic, which degrades rather than fails.
alter table practice_tests add column class_level text;

-- Unpublished sets are invisible to students, so a half-authored diagnostic is safe to save —
-- same posture as an unpublished post-session material (0020).
alter table practice_tests add column published_at timestamptz;

alter table practice_tests
  add constraint practice_tests_key_shape
  check ((kind = 'math_diagnostic') = (class_level is not null));

create unique index practice_tests_class_level_idx on practice_tests (class_level)
  where (class_level is not null);

-- The PSAT is offered as a sub-purpose (`purposes.ts`) but 0012 seeded only SAT and ACT, so a
-- PSAT booking had no set to look up at all.
insert into practice_tests (slug, name) values ('psat', 'PSAT')
on conflict (slug) do nothing;

-- Existing sets predate publication and have no authored content behind them; leaving
-- `published_at` null keeps them out of the student path until the owner publishes them.

-- Students may only see published sets. The 0012 policy allowed public read of every row.
drop policy practice_tests_public_read on practice_tests;
create policy practice_tests_published_read on practice_tests for select using (
  published_at is not null
);
create policy practice_tests_admin_read on practice_tests for select using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);

-- Questions follow their set: readable only once it is published. The `answer` column stays
-- withheld by the 0012 column grant either way — authoring and checking both go through the
-- service role, exactly as `questions` does (INV-SECRET).
drop policy test_prep_questions_public_read on test_prep_questions;
create policy test_prep_questions_published_read on test_prep_questions for select using (
  exists (select 1 from practice_tests t where t.id = practice_test_id and t.published_at is not null)
);

-- ---------------------------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------------------------

-- What the student answered, per booking. Two jobs: it is what reaches the tutor before the
-- session (AT-OPS-5), and its existence is what stops a repeat booking re-sitting the same
-- diagnostic (AT-PRE-3) — taken once per test or level, not once per session.
create table diagnostic_responses (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references bookings (id) on delete cascade,
  profile_id        uuid not null references learner_profiles (id) on delete cascade,
  practice_test_id  uuid not null references practice_tests (id) on delete cascade,
  question_id       uuid not null references test_prep_questions (id) on delete cascade,
  submitted         text not null,
  -- Null for a free-response question, which is never auto-graded (`checkSubmission`).
  is_correct        boolean,
  answered_at       timestamptz not null default now(),

  unique (booking_id, question_id)
);

create index diagnostic_responses_profile_idx on diagnostic_responses (profile_id, practice_test_id);

alter table diagnostic_responses enable row level security;

-- The student writes their own answers. **No buyer policy**: a parent watching their child's
-- answers arrive question by question is not what this is for, and the tutor reports on it
-- afterwards in the post-session material.
create policy diagnostic_responses_student_all on diagnostic_responses for all using (
  profile_id = current_student_profile_id()
) with check (
  profile_id = current_student_profile_id()
);

create policy diagnostic_responses_admin_read on diagnostic_responses for select using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);

grant select, insert, update on diagnostic_responses to authenticated;
grant all on diagnostic_responses to service_role;
