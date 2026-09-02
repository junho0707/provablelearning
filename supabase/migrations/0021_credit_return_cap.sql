-- 0021_credit_return_cap — the 2-per-calendar-month cap on credit returns (ADR-007 §7,
-- INV-CREDIT-2, system/02-POLICIES.md §5).
--
-- ADR-006 allowed an uncapped, case-by-case appeal. That had no ceiling on operator workload or on
-- abuse. The cap makes the policy statable in one sentence, and operator review is kept because
-- auto-approval would make the note meaningless and amount to two free misses a month regardless
-- of reason.
--
-- Two design points worth stating, because both are easy to get wrong:
--
--   1. **The cap is per student, combined**, not per account and not per cause. A sibling's misses
--      must not consume another student's allowance, and a late cancellation and a no-show draw on
--      the same two.
--   2. **Usage is counted by the month the session was in**, not the month the request was
--      approved. Otherwise a slow approval would silently consume the *next* month's allowance,
--      and a buyer would be penalised for the operator's response time.

-- How many returns this student has already had for sessions in the same calendar month as
-- `p_at`. Counts approved requests only — a pending one has not been granted, and a denied one
-- never was.
create function credit_returns_used(p_profile_id uuid, p_at timestamptz)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from credit_return_requests r
  join bookings b on b.id = r.booking_id
  where b.profile_id = p_profile_id
    and r.status = 'approved'
    and date_trunc('month', b.starts_at) = date_trunc('month', p_at);
$$;

-- What the buyer is shown before they cancel late, and when they are told a session was missed
-- (F9 step 3, F10 step 2). Returning this rather than a boolean lets the UI say "1 left this
-- month" instead of only "you may appeal".
create function credit_return_allowance(p_profile_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, 2 - credit_returns_used(p_profile_id, now()));
$$;

grant execute on function credit_returns_used(uuid, timestamptz) to authenticated;
grant execute on function credit_return_allowance(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Requesting a return
-- ---------------------------------------------------------------------------------------------

-- Eligibility is unchanged from 0015 — "the credit was burned" is a `no_show`, or a `cancelled`
-- booking with no `cancel_refund` ledger row. What is new is the cap: **at the third miss in a
-- month no request may even be created** (F10 step 6), so the buyer is told the credit is gone
-- rather than being allowed to appeal into a wall.
create or replace function request_credit_return(p_booking_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
  v_booking bookings;
  v_request_id uuid;
begin
  select b.* into v_booking
  from bookings b
  where b.id = p_booking_id
    and b.account_id = v_account_id
    and (
      b.status = 'no_show'
      or (
        b.status = 'cancelled'
        and not exists (
          select 1 from credit_ledger l
          where l.booking_id = b.id and l.reason = 'cancel_refund'
        )
      )
    );
  if not found then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  -- INV-CREDIT-2, checked at creation as well as at approval. Checking only at approval would let
  -- a buyer submit notes that can never be granted.
  if credit_returns_used(v_booking.profile_id, v_booking.starts_at) >= 2 then
    raise exception 'cap_reached' using errcode = 'P0001';
  end if;

  -- One live appeal per booking. A denied request may be resubmitted; a pending or already
  -- approved one may not, so an approval can never be claimed twice (INV-CREDIT-1).
  if exists (
    select 1 from credit_return_requests
    where booking_id = p_booking_id and status in ('pending', 'approved')
  ) then
    raise exception 'already_requested' using errcode = 'P0001';
  end if;

  insert into credit_return_requests (booking_id, account_id, reason)
  values (p_booking_id, v_account_id, p_reason)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Approving one
-- ---------------------------------------------------------------------------------------------

-- The cap is re-checked here, and this is the check that actually enforces INV-CREDIT-2: several
-- requests can be pending at once, and approving them one by one would otherwise walk past the
-- limit. The database refuses, not the admin UI.
create or replace function resolve_credit_return_request(p_request_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_request credit_return_requests;
  v_booking bookings;
begin
  if not exists (select 1 from accounts a where a.id = v_admin_id and a.is_admin) then
    raise exception 'denied' using errcode = 'P0001';
  end if;
  if p_decision not in ('approved', 'denied') then
    raise exception 'malformed' using errcode = 'P0001';
  end if;

  select * into v_request from credit_return_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into v_booking from bookings where id = v_request.booking_id;

  if p_decision = 'approved' then
    if credit_returns_used(v_booking.profile_id, v_booking.starts_at) >= 2 then
      raise exception 'cap_reached' using errcode = 'P0001';
    end if;

    insert into credit_ledger (account_id, delta, reason, booking_id)
    values (v_request.account_id, 1, 'noshow_return', v_request.booking_id);
  end if;

  update credit_return_requests set status = p_decision, resolved_at = now() where id = p_request_id;

  insert into audit_log (actor_id, action, target, payload)
  values (v_admin_id, 'resolve_credit_return_request', p_request_id::text,
          jsonb_build_object('decision', p_decision, 'profile_id', v_booking.profile_id));
end;
$$;
