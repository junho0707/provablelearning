-- A First Session is chosen with its time, then paid for (ADR-009). The buyer picks the slot on
-- `/first-session`, the slot rides along in the Stripe session's metadata, and the webhook books it
-- in the same handler that records the purchase — so paying is what finishes the booking, rather
-- than leaving an entitlement the buyer has to come back and spend.
--
-- The webhook runs as `service_role` with no JWT, so `auth.uid()` is null there. This splits the
-- existing function in two: the account is a parameter, and the authenticated entry point resolves
-- it from the session before delegating. One implementation, two callers.

create or replace function book_first_session_for_account(
  p_account_id  uuid,
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
  v_booking_id uuid;
  v_purchase purchases;
begin
  if p_account_id is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not exists (select 1 from learner_profiles where id = p_profile_id and account_id = p_account_id) then
    raise exception 'invalid_profile' using errcode = 'P0001';
  end if;

  select * into v_purchase from purchases
  where id = p_purchase_id
    and account_id = p_account_id
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
  values (p_account_id, p_profile_id, p_starts_at, p_purchase_id, v_purchase.purpose, v_purchase.sub_purpose, p_specifics, 'new')
  returning id into v_booking_id;

  delete from released_slots where starts_at = p_starts_at;

  return v_booking_id;
end;
$$;

-- Only the webhook may name its own account. A buyer's client can reach the `auth.uid()` entry
-- point below and nothing else, so passing someone else's account id is not a request they can make.
revoke execute on function book_first_session_for_account(uuid, uuid, timestamptz, uuid, text) from public;
grant execute on function book_first_session_for_account(uuid, uuid, timestamptz, uuid, text) to service_role;

-- The buyer-facing entry point keeps its signature and its meaning. It stays because the slot can
-- be gone by the time the webhook lands (nothing holds it through checkout), and the buyer is then
-- left holding a paid entitlement to spend on `/book` the ordinary way.
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
begin
  return book_first_session_for_account(auth.uid(), p_profile_id, p_starts_at, p_purchase_id, p_specifics);
end;
$$;

grant execute on function book_first_session(uuid, timestamptz, uuid, text) to authenticated;
