-- 0017_student_logins — students get their own credentials, gated on parental consent (ADR-007 §2,
-- system/06-AUTH-AND-COPPA.md).
--
-- This reverses 0003's central design note. There, `learner_profiles` deliberately had **no
-- credentials**, which is what kept COPPA out of scope. ADR-007 decided the pre/post-session
-- experience is the product and cannot be relayed by a parent, so students now log in — and the
-- consent stack comes with it.
--
-- Three mechanisms, in layers:
--   1. A student's `auth.users` row is created **banned** and is unbanned only when consent is
--      recorded, so an un-consented student cannot obtain a session at all (application side).
--   2. `login_active` mirrors that state in the database, and every policy touching
--      student-submitted data requires it (INV-COPPA-1).
--   3. Student auth users get **no `accounts` row**, so every existing `account_id = auth.uid()`
--      policy denies them by construction (INV-ACTOR-1). That is the load-bearing one: money and
--      booking stay unreachable without a single new check.

-- ---------------------------------------------------------------------------------------------
-- Student credentials on the profile
-- ---------------------------------------------------------------------------------------------

alter table learner_profiles
  -- The student's own auth user. Null until the buyer sets credentials.
  add column auth_user_id uuid unique references auth.users (id) on delete set null,
  -- Sign-in name. Unique service-wide because it is the identifier the student types.
  add column username text unique,
  -- False until consent is recorded (INV-COPPA-1). Never set true by application code directly —
  -- `record_consent` owns it.
  add column login_active boolean not null default false,
  -- The math-diagnostic flow needs both (system/03-FLOWS.md F6).
  add column current_math_class text,
  add column previous_math_class text,
  -- Ordered purposes, free text permitted (system/02-POLICIES.md §7).
  add column primary_purpose text,
  add column secondary_purpose text;

-- 0016's vocabulary (`strengths | test_prep | class_help`) is the *old* three-mode model and cannot
-- express the five school sub-purposes or free text. Carry what exists into the new primary slot,
-- then drop it — a silent left-behind column would drift.
update learner_profiles
  set primary_purpose = purposes[1], secondary_purpose = purposes[2]
  where array_length(purposes, 1) > 0;

alter table learner_profiles drop constraint if exists learner_profiles_purposes_valid;
alter table learner_profiles drop column purposes;

create index learner_profiles_auth_user_idx on learner_profiles (auth_user_id);

-- A username must look like one. Kept loose deliberately — a parent picks this for a child, and
-- rejecting a reasonable name is worse than accepting an odd one.
alter table learner_profiles
  add constraint learner_profiles_username_shape
  check (username is null or username ~ '^[A-Za-z0-9._-]{3,40}$');

-- ---------------------------------------------------------------------------------------------
-- A student auth user must never become an account
-- ---------------------------------------------------------------------------------------------

-- 0003's trigger provisioned an `accounts` row for *every* new auth user. A student reaching that
-- path would silently gain a wallet, a booking surface, and cross-table read access — the exact
-- failure INV-ACTOR-1 exists to prevent. Students are flagged in user metadata at creation.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'is_student', 'false') = 'true' then
    return new;
  end if;

  insert into public.accounts (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------------------------

-- One row per consent-establishing or consent-revoking event. Revocation is a row, never a
-- deletion: the record of what was consented to, and when, is itself a compliance artifact.
create table consent_events (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts (id) on delete cascade,
  -- 'granted' | 'revoked'. The mechanism is recorded because a regulator asks how, not just whether.
  event        text not null check (event in ('granted', 'revoked')),
  mechanism    text not null check (mechanism in ('stripe_payment', 'admin')),
  -- The purchase whose card payment established consent (system/06-AUTH-AND-COPPA.md §3).
  purchase_id  uuid references purchases (id),
  -- Null means account-wide; set when a single student's consent is revoked.
  profile_id   uuid references learner_profiles (id) on delete cascade,
  at           timestamptz not null default now()
);

create index consent_events_account_idx on consent_events (account_id, at desc);

alter table consent_events enable row level security;

create policy consent_events_select_own on consent_events for select using (
  account_id = auth.uid() or exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);

grant select on consent_events to authenticated;
grant all on consent_events to service_role;

-- ---------------------------------------------------------------------------------------------
-- RLS: a student reaches exactly their own profile row, and only once consent has cleared
-- ---------------------------------------------------------------------------------------------

-- Used by every policy on student-submitted data. STABLE so the planner can hoist it out of loops.
create function current_student_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from learner_profiles
  where auth_user_id = auth.uid() and login_active
  limit 1;
$$;

grant execute on function current_student_profile_id() to authenticated;

-- The student may read their own profile; they may not create, delete, or rename themselves, and
-- they explicitly may not change their own credentials (INV-AUTH-1) — there is no update policy.
create policy learner_profiles_select_self on learner_profiles for select using (
  auth_user_id = auth.uid() and login_active
);

-- ---------------------------------------------------------------------------------------------
-- Recording consent
-- ---------------------------------------------------------------------------------------------

-- Called by the Stripe webhook (service role) after a successful payment. Idempotent: a replayed
-- webhook records one event and leaves activation unchanged, matching INV-MONEY-3's guarantee for
-- the purchase itself.
create function record_consent(p_account_id uuid, p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from consent_events
    where account_id = p_account_id and event = 'granted' and purchase_id is not distinct from p_purchase_id
  ) then
    insert into consent_events (account_id, event, mechanism, purchase_id)
    values (p_account_id, 'granted', 'stripe_payment', p_purchase_id);
  end if;

  -- Activation is account-wide: consent is given by the parent for their household, and a sibling
  -- added later inherits it rather than requiring a second payment to become usable.
  update learner_profiles
    set login_active = true
    where account_id = p_account_id and auth_user_id is not null;
end;
$$;

-- The buyer revoking consent for one student (F13). Deactivates the login and stops collection
-- without deleting anything — deletion is a separate, explicit act.
create function revoke_consent(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
begin
  if not exists (select 1 from learner_profiles where id = p_profile_id and account_id = v_account_id) then
    raise exception 'denied' using errcode = 'P0001';
  end if;

  update learner_profiles set login_active = false where id = p_profile_id;

  insert into consent_events (account_id, event, mechanism, profile_id)
  values (v_account_id, 'revoked', 'admin', p_profile_id);
end;
$$;

-- True once this account has ever granted consent — the webhook activates new siblings from it, and
-- the UI uses it to explain why a login is not yet usable.
create function account_has_consent(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from consent_events where account_id = p_account_id and event = 'granted'
  );
$$;

grant execute on function revoke_consent(uuid) to authenticated;
grant execute on function account_has_consent(uuid) to authenticated;
grant execute on function record_consent(uuid, uuid) to service_role;
