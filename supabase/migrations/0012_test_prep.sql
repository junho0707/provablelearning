-- 0012_test_prep — hand-authored fixed practice-test sets (TASK-FIRST-004).
--
-- Deliberately **not** the `questions` table: test-prep sets are fixed, hand-authored, and not
-- tied to a roadmap node/lesson (ADR-005 — the goal `test_prep` bypasses the roadmap-derived
-- assessment entirely). Reusing `questions` would force a fake `lesson_slug`, which would break
-- the lesson-slug integrity guard in `src/lib/practice/integrity.test.ts`. Same answer-secrecy
-- shape and column-privilege wall as `questions` (AT-PRACTICE-005) — deliberately mirrored, not
-- shared, so the two content types can evolve independently.

create table practice_tests (
  id   uuid primary key default gen_random_uuid(),
  slug text not null unique, -- 'sat' | 'act' | ...
  name text not null
);

create table test_prep_questions (
  id               uuid primary key default gen_random_uuid(),
  practice_test_id uuid not null references practice_tests (id) on delete cascade,
  position         int  not null,
  type             question_type not null,
  prompt           text not null,
  choices          jsonb,
  answer           text,
  tolerance        numeric,
  explanation      text not null,

  unique (practice_test_id, position),
  constraint mcq_shape check (type <> 'mcq' or (choices is not null and answer is not null)),
  constraint numeric_shape check (type <> 'numeric' or (answer is not null and (tolerance is null or tolerance >= 0))),
  constraint free_shape check (type <> 'free' or (answer is null and tolerance is null and choices is null))
);

create index test_prep_questions_test_idx on test_prep_questions (practice_test_id, position);

alter table practice_tests enable row level security;
alter table test_prep_questions enable row level security;

create policy practice_tests_public_read on practice_tests for select using (true);
create policy test_prep_questions_public_read on test_prep_questions for select using (true);

grant select on practice_tests to anon, authenticated;
revoke all on test_prep_questions from anon, authenticated;
grant select (id, practice_test_id, position, type, prompt, choices) on test_prep_questions to anon, authenticated;
grant all on practice_tests, test_prep_questions to service_role;

insert into practice_tests (slug, name) values ('sat', 'SAT'), ('act', 'ACT');
