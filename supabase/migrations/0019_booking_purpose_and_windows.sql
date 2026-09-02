-- 0019_booking_purpose_and_windows — what a session is for, and the new booking windows
-- (ADR-007 §5, §6, §8; system/02-POLICIES.md §2-§3).
--
-- Three changes:
--   1. Every booking now carries its **purpose**, specifics, and whether it continues the last
--      topic. This is what the tutor prepares from and what selects the student's pre-session work
--      — previously only the First Session had any of it.
--   2. Notice and free cancellation drop from 24 hours to **6**, and a slot freed by a
--      cancellation stays bookable until **1 hour** before it starts (INV-BOOK-3).
--   3. The 4-week horizon **steps every Monday** instead of creeping forward daily.
--
-- `date_trunc('week', ...)` is Monday-based in Postgres, which is exactly the release boundary, so
-- the horizon needs no calendar arithmetic of its own. `horizonEnd()` in slots.ts computes the
-- same instant for the picker; the two must agree, or a slot would be offered and then refused.

alter table bookings
  add column purpose      text,
  add column sub_purpose  text,
  -- What the buyer typed: the unit, the upcoming test, what they want to understand.
  add column specifics    text,
  -- 'new' | 'continue' — whether this session picks up the previous topic (F5 step 2).
  add column topic_mode   text check (topic_mode in ('new', 'continue'));

-- Slots freed by a cancellation or a reschedule. Its own table rather than a flag on `bookings`:
-- a released slot is a property of the *calendar*, not of the booking that vacated it, and the
-- alternative — a placeholder cancelled booking to mark the freed instant — would surface in the
-- buyer's own session list as a session they never had.
create table released_slots (
  starts_at   timestamptz primary key,
  released_at timestamptz not null default now()
);

alter table released_slots enable row level security;
-- Readable by any signed-in buyer: the picker needs to know which slots carry the shorter floor,
-- and an instant reveals nothing about whose booking freed it.
create policy released_slots_select_all on released_slots for select using (auth.uid() is not null);
grant select on released_slots to authenticated;
grant all on released_slots to service_role;

-- ---------------------------------------------------------------------------------------------
-- Shared window logic
-- ---------------------------------------------------------------------------------------------

-- The far edge of the bookable window. Kept as a function so `book_session`, `reschedule_booking`
-- and any future caller cannot disagree about where the horizon is.
create function booking_horizon_end()
returns timestamptz
language sql
stable
as $$
  select date_trunc('week', now() at time zone 'utc') + interval '28 days';
$$;

-- The minimum notice for one slot: 6 hours normally, 1 hour if this slot was freed by a
-- cancellation. A released slot is already on the operator's calendar, so letting it be reclaimed
-- late costs nothing and refusing only wastes the hour.
create function slot_min_notice(p_starts_at timestamptz)
returns interval
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from released_slots where starts_at = p_starts_at)
      then interval '1 hour'
    else interval '6 hours'
  end;
$$;

grant execute on function booking_horizon_end() to authenticated;
grant execute on function slot_min_notice(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Booking, with purpose capture and the new windows
-- ---------------------------------------------------------------------------------------------

drop function if exists book_session(uuid, timestamptz, uuid);

create function book_session(
  p_profile_id  uuid,
  p_starts_at   timestamptz,
  p_purpose     text,
  p_sub_purpose text default null,
  p_specifics   text default null,
  p_topic_mode  text default 'new',
  p_purchase_id uuid default null
)
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

  if p_purpose is null or length(trim(p_purpose)) = 0 then
    raise exception 'purpose_required' using errcode = 'P0001';
  end if;

  -- INV-BOOK-3, both ends of the window.
  if p_starts_at - now() < slot_min_notice(p_starts_at) then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;
  if p_starts_at > booking_horizon_end() then
    raise exception 'beyond_horizon' using errcode = 'P0001';
  end if;

  -- Serializes concurrent attempts at the same slot — there's no row to lock until one exists.
  perform pg_advisory_xact_lock(hashtext(p_starts_at::text));

  if exists (select 1 from bookings where starts_at = p_starts_at and status <> 'cancelled') then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  insert into bookings (account_id, profile_id, starts_at, purchase_id, purpose, sub_purpose, specifics, topic_mode)
  values (v_account_id, p_profile_id, p_starts_at, p_purchase_id, p_purpose, p_sub_purpose, p_specifics, coalesce(p_topic_mode, 'new'))
  returning id into v_booking_id;

  delete from released_slots where starts_at = p_starts_at;

  -- Rolls back the whole transaction (including the insert above) if the balance is < 1 — the
  -- reservation and the spend either both happen or neither does (INV-MONEY-1).
  perform spend_credit(v_account_id, 'booking_spend', v_booking_id);

  return v_booking_id;
end;
$$;

grant execute on function book_session(uuid, timestamptz, text, text, text, text, uuid) to authenticated;

-- First Session bookings capture the same context. The purpose was stated at purchase, so it is
-- carried over rather than asked again; specifics and topic mode still come from the booking form.
create or replace function book_first_session(
  p_profile_id  uuid,
  p_starts_at   timestamptz,
  p_purchase_id uuid,
  p_specifics   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
  v_booking_id uuid;
  v_purchase purchases;
begin
  if v_account_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not exists (select 1 from learner_profiles where id = p_profile_id and account_id = v_account_id) then
    raise exception 'invalid_profile' using errcode = 'P0001';
  end if;

  select * into v_purchase from purchases
  where id = p_purchase_id
    and account_id = v_account_id
    and sku = 'first_session'
    and profile_id = p_profile_id;
  if not found then
    raise exception 'invalid_purchase' using errcode = 'P0001';
  end if;

  if exists (select 1 from bookings where purchase_id = p_purchase_id) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;

  if p_starts_at - now() < slot_min_notice(p_starts_at) then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;
  if p_starts_at > booking_horizon_end() then
    raise exception 'beyond_horizon' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_starts_at::text));

  if exists (select 1 from bookings where starts_at = p_starts_at and status <> 'cancelled') then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  insert into bookings (account_id, profile_id, starts_at, purchase_id, purpose, sub_purpose, specifics, topic_mode)
  values (v_account_id, p_profile_id, p_starts_at, p_purchase_id, v_purchase.purpose, v_purchase.sub_purpose, p_specifics, 'new')
  returning id into v_booking_id;

  delete from released_slots where starts_at = p_starts_at;

  return v_booking_id;
end;
$$;

grant execute on function book_first_session(uuid, timestamptz, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Cancellation returns the slot to the pool
-- ---------------------------------------------------------------------------------------------

-- 24h becomes 6h, and the freed slot is marked `released_at` so `slot_min_notice` can offer it on
-- the shorter floor. Idempotent: cancelling an already-cancelled booking is a no-op, not an error.
create or replace function cancel_booking(p_booking_id uuid)
returns boolean -- true iff a refund was issued by this call
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
  v_booking bookings;
  v_refunded boolean := false;
begin
  select * into v_booking from bookings where id = p_booking_id and account_id = v_account_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_booking.status = 'cancelled' then
    return false;
  end if;
  if v_booking.status <> 'booked' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if v_booking.starts_at - now() >= interval '6 hours' then
    insert into credit_ledger (account_id, delta, reason, booking_id) values (v_account_id, 1, 'cancel_refund', p_booking_id);
    v_refunded := true;
  end if;

  update bookings set status = 'cancelled' where id = p_booking_id;

  -- The hour goes back on the calendar and may be reclaimed until 1 hour before it starts.
  insert into released_slots (starts_at) values (v_booking.starts_at)
  on conflict (starts_at) do update set released_at = now();

  return v_refunded;
end;
$$;

-- Reschedule (F9): offered ≥6h before the *current* start, and the new slot must itself be
-- bookable. Moves the slot in place — **does not touch the ledger**, so it can't be used as a
-- cancel/rebook round trip to dodge the notice rule.
create or replace function reschedule_booking(p_booking_id uuid, p_new_starts_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
  v_booking bookings;
begin
  select * into v_booking from bookings where id = p_booking_id and account_id = v_account_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'booked' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if v_booking.starts_at - now() < interval '6 hours' then
    raise exception 'too_late' using errcode = 'P0001';
  end if;
  if p_new_starts_at - now() < slot_min_notice(p_new_starts_at)
     or p_new_starts_at > booking_horizon_end() then
    raise exception 'new_slot_not_bookable' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_new_starts_at::text));
  if exists (select 1 from bookings where starts_at = p_new_starts_at and status <> 'cancelled' and id <> p_booking_id) then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  update bookings set starts_at = p_new_starts_at where id = p_booking_id;

  -- The old instant is freed by the move, exactly as a cancellation frees one; the new one is no
  -- longer free, so it stops carrying the shorter floor.
  insert into released_slots (starts_at) values (v_booking.starts_at)
  on conflict (starts_at) do update set released_at = now();
  delete from released_slots where starts_at = p_new_starts_at;
end;
$$;
