-- 0003_accounts — buyer accounts + learner profiles (TASK-ACCT-001).
--
-- `accounts` is the buyer/owner, one row per Supabase auth user (spec/14 §16, 07_DATA_MODEL).
-- `learner_profiles` sit beneath it — name/grade/current class, **no credentials** (INV-ACTOR-1,
-- ADR-003): keeping the two tables distinct even for an independent student (buyer == learner) is
-- what makes a future profile→login upgrade additive instead of a migration.
--
-- An `accounts` row is created automatically on signup via a trigger on `auth.users`, so app code
-- never has to remember to provision one before creating profiles.

create table accounts (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create table learner_profiles (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references accounts (id) on delete cascade,
  name               text not null check (char_length(trim(name)) > 0),
  grade              text,
  -- A course-level roadmap node id (ADR-005, TASK-ROADMAP-002) — validated against roadmap.json
  -- at the application layer, not here, since the roadmap lives outside the DB.
  current_course_node text,
  created_at         timestamptz not null default now()
);

create index learner_profiles_account_idx on learner_profiles (account_id);

-- Auto-provision an `accounts` row for every new auth user (Google OAuth or magic link alike).
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter table accounts enable row level security;
alter table learner_profiles enable row level security;

-- A buyer reaches only their own account row and their own profiles (AT-SEC-001).
create policy accounts_select_own on accounts for select using (id = auth.uid());
create policy accounts_update_own on accounts for update using (id = auth.uid());

create policy learner_profiles_select_own on learner_profiles for select using (account_id = auth.uid());
create policy learner_profiles_insert_own on learner_profiles for insert with check (account_id = auth.uid());
create policy learner_profiles_update_own on learner_profiles for update using (account_id = auth.uid());
create policy learner_profiles_delete_own on learner_profiles for delete using (account_id = auth.uid());

grant select, update (email) on accounts to authenticated;
grant select, insert, update, delete on learner_profiles to authenticated;
grant all on accounts, learner_profiles to service_role;
