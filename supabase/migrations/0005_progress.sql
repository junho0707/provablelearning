-- 0005_progress — question attempts + lesson completion (TASK-PROGRESS-001).
--
-- Written only when signed in; anonymous practice records nothing, which is what keeps lesson
-- pages static (ADR-004). RLS is scoped through `learner_profiles` ownership, not a direct
-- `account_id` column on these tables (they belong to a *profile*, spec/07_DATA_MODEL).

create table question_attempts (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references learner_profiles (id) on delete cascade,
  question_id  uuid not null references questions (id) on delete cascade,
  is_correct   boolean not null,
  submitted_at timestamptz not null default now()
);

create index question_attempts_profile_idx on question_attempts (profile_id);
create index question_attempts_question_idx on question_attempts (question_id);

create table lesson_progress (
  profile_id   uuid not null references learner_profiles (id) on delete cascade,
  lesson_slug  text not null,
  completed_at timestamptz,
  primary key (profile_id, lesson_slug)
);

alter table question_attempts enable row level security;
alter table lesson_progress enable row level security;

-- A buyer reaches attempts/progress only for profiles they own (AT-SEC-001).
create policy question_attempts_select_own on question_attempts for select using (
  exists (select 1 from learner_profiles lp where lp.id = profile_id and lp.account_id = auth.uid())
);
create policy question_attempts_insert_own on question_attempts for insert with check (
  exists (select 1 from learner_profiles lp where lp.id = profile_id and lp.account_id = auth.uid())
);

create policy lesson_progress_select_own on lesson_progress for select using (
  exists (select 1 from learner_profiles lp where lp.id = profile_id and lp.account_id = auth.uid())
);
create policy lesson_progress_upsert_own on lesson_progress for insert with check (
  exists (select 1 from learner_profiles lp where lp.id = profile_id and lp.account_id = auth.uid())
);
create policy lesson_progress_update_own on lesson_progress for update using (
  exists (select 1 from learner_profiles lp where lp.id = profile_id and lp.account_id = auth.uid())
);

grant select, insert on question_attempts to authenticated;
grant select, insert, update on lesson_progress to authenticated;
grant all on question_attempts, lesson_progress to service_role;
