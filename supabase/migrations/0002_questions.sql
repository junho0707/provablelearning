-- 0002_questions — practice Questions (TASK-PRACTICE-001).
--
-- Questions are structured DB rows joined to in-repo MDX lessons by `lesson_slug` (ADR-001).
-- Content is world-readable (NFR-SEC-001), BUT the auto-check secret (`answer`, `tolerance`) and
-- the `explanation` must never reach the client (AT-PRACTICE-005). RLS is row-level only, so we
-- additionally use COLUMN privileges: anon/authenticated may read the presentational columns but
-- not the answer/explanation. Trusted server code reads those via the service-role key inside
-- checkAnswer. Writes are service-role only (admin question CRUD lands in TASK-ADMIN-001).

create type question_type as enum ('mcq', 'numeric', 'free');

create table questions (
  id          uuid primary key default gen_random_uuid(),
  lesson_slug text not null,
  position    int  not null,
  type        question_type not null,
  prompt      text not null,
  choices     jsonb,        -- mcq only: array of {id, label}; null otherwise
  answer      text,         -- mcq: correct choice id; numeric: canonical value (text); null for free
  tolerance   numeric,      -- numeric only: absolute tolerance (>= 0); null otherwise
  explanation text not null,
  created_at  timestamptz not null default now(),

  unique (lesson_slug, position),

  -- Per-type shape rules (REQ-PRACTICE-001).
  constraint mcq_shape check (
    type <> 'mcq' or (choices is not null and answer is not null)
  ),
  constraint numeric_shape check (
    type <> 'numeric' or (answer is not null and (tolerance is null or tolerance >= 0))
  ),
  constraint free_shape check (
    type <> 'free' or (answer is null and tolerance is null and choices is null)
  )
);

create index questions_lesson_idx on questions (lesson_slug, position);

alter table questions enable row level security;

-- World-readable ROWS...
create policy questions_public_read on questions for select using (true);

-- ...but restrict COLUMNS: the answer secret and explanation are not selectable by public roles.
-- (Column privileges are enforced before RLS; the service_role key bypasses both.)
revoke all on questions from anon, authenticated;
grant select (id, lesson_slug, position, type, prompt, choices) on questions to anon, authenticated;
grant all on questions to service_role;
