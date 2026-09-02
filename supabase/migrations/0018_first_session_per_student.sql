-- 0018_first_session_per_student — the First Session becomes per **student**, and a purchase is
-- what records parental consent (ADR-007 §4 and §2).
--
-- Two changes that look unrelated and are not. Both follow from a purchase now being made *for a
-- named student* rather than for an account:
--   1. `INV-FIRST-1` moves from the account to the profile, so a household with three students
--      unlocks three First Sessions.
--   2. The payment is the verifiable-parental-consent event, and it is only meaningful when we
--      know whose parent paid — so `process_purchase` records consent and activates the household's
--      student logins in the same transaction that grants the credits.

-- ---------------------------------------------------------------------------------------------
-- A purchase is made for a student, and carries the session's purpose
-- ---------------------------------------------------------------------------------------------

alter table purchases
  -- Required for `first_session`, null for credit packs — a pack tops up a shared wallet and
  -- belongs to nobody in particular. Enforced by the check below.
  add column profile_id uuid references learner_profiles (id) on delete set null,
  add column sub_purpose text;

-- `goal` predates the taxonomy in system/02-POLICIES.md §7 and named only the old three modes.
-- Renamed rather than replaced so existing rows keep their meaning.
alter table purchases rename column goal to purpose;
alter table purchases drop constraint if exists purchases_goal_check;

-- Free text is permitted (ADR-007) — presets are suggestions, so there is deliberately no CHECK on
-- the value. What *is* enforced is the shape: a First Session states a purpose and a student.
alter table purchases
  add constraint purchases_first_session_shape
  check (
    sku <> 'first_session'
    or (profile_id is not null and purpose is not null)
  );

-- INV-FIRST-1, moved from account to student. Partial so credit packs are unconstrained.
drop index if exists purchases_one_first_session_per_account;
create unique index purchases_one_first_session_per_profile
  on purchases (profile_id) where (sku = 'first_session');

-- ---------------------------------------------------------------------------------------------
-- Purchase processing now also records consent
-- ---------------------------------------------------------------------------------------------

drop function if exists process_purchase(text, uuid, text, int, int, text, text);

create function process_purchase(
  p_event_id          text,
  p_account_id        uuid,
  p_sku               text,
  p_amount_cents      int,
  p_credits           int,
  p_purpose           text,
  p_sub_purpose       text,
  p_profile_id        uuid,
  p_stripe_session_id text
)
returns boolean -- true iff this call actually processed the event; false on a redelivery no-op
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
begin
  -- Idempotency guard, unchanged (INV-MONEY-3): if this event was already processed, do nothing.
  begin
    insert into stripe_events (event_id) values (p_event_id);
  exception when unique_violation then
    return false;
  end;

  insert into purchases (account_id, sku, amount_cents, purpose, sub_purpose, profile_id, stripe_session_id)
  values (p_account_id, p_sku, p_amount_cents, p_purpose, p_sub_purpose, p_profile_id, p_stripe_session_id)
  returning id into v_purchase_id;

  if p_credits > 0 then
    insert into credit_ledger (account_id, delta, reason)
    values (p_account_id, p_credits, 'purchase');
  end if;

  -- The card payment is the consent mechanism (system/06-AUTH-AND-COPPA.md §3). Recording it here,
  -- inside the same transaction as the purchase, means consent and the payment that establishes it
  -- can never disagree — there is no window where money moved but consent went unrecorded.
  --
  -- Any successful purchase counts, not only a First Session: a parent buying a credit pack has
  -- performed the same verifiable transaction.
  perform record_consent(p_account_id, v_purchase_id);

  return true;
end;
$$;

grant execute on function process_purchase(text, uuid, text, int, int, text, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Booking a First Session must use that student's own purchase
-- ---------------------------------------------------------------------------------------------

-- Previously any of the account's unused First Session purchases could book any of its profiles.
-- With one purchase per student that would let a sibling consume another student's session.
create or replace function book_first_session(p_profile_id uuid, p_starts_at timestamptz, p_purchase_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
  v_booking_id uuid;
begin
  if v_account_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not exists (select 1 from learner_profiles where id = p_profile_id and account_id = v_account_id) then
    raise exception 'invalid_profile' using errcode = 'P0001';
  end if;

  -- The purchase must belong to this account *and* to this student.
  if not exists (
    select 1 from purchases
    where id = p_purchase_id
      and account_id = v_account_id
      and sku = 'first_session'
      and profile_id = p_profile_id
  ) then
    raise exception 'invalid_purchase' using errcode = 'P0001';
  end if;

  if exists (select 1 from bookings where purchase_id = p_purchase_id) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_starts_at::text));

  if exists (select 1 from bookings where starts_at = p_starts_at and status <> 'cancelled') then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  insert into bookings (account_id, profile_id, starts_at, purchase_id)
  values (v_account_id, p_profile_id, p_starts_at, p_purchase_id)
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

grant execute on function book_first_session(uuid, timestamptz, uuid) to authenticated;

-- Which of an account's students still have their First Session available (F4). A student qualifies
-- when they have no `first_session` purchase at all.
create function students_eligible_for_first_session()
returns table (profile_id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name
  from learner_profiles p
  where p.account_id = auth.uid()
    and not exists (
      select 1 from purchases pu
      where pu.profile_id = p.id and pu.sku = 'first_session'
    )
  order by p.created_at;
$$;

grant execute on function students_eligible_for_first_session() to authenticated;
