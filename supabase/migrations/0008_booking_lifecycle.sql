-- 0008_booking_lifecycle — cancel/reschedule (TASK-BOOK-002), no-show + credit-return
-- (TASK-BOOK-005), and the generic audit trail admin actions write to (TASK-ADMIN-001).

create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid not null references accounts (id),
  action     text not null,
  target     text not null,
  payload    jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);

alter table audit_log enable row level security;
-- Admin-only, both directions: nobody but the admin should see or write the audit trail.
create policy audit_log_admin_only on audit_log for all using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
) with check (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
grant select, insert on audit_log to authenticated;
grant all on audit_log to service_role;

create table credit_return_requests (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings (id),
  account_id   uuid not null references accounts (id),
  reason       text not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table credit_return_requests enable row level security;
create policy credit_return_requests_select_own on credit_return_requests for select using (
  account_id = auth.uid() or exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
create policy credit_return_requests_insert_own on credit_return_requests for insert with check (account_id = auth.uid());
grant select, insert on credit_return_requests to authenticated;
grant all on credit_return_requests to service_role;

-- Cancel a booking (F9). ≥24h before start refunds the credit; inside 24h it burns (spec/14 §15).
-- Idempotent: cancelling an already-cancelled booking is a no-op, not an error.
create function cancel_booking(p_booking_id uuid)
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

  if v_booking.starts_at - now() >= interval '24 hours' then
    insert into credit_ledger (account_id, delta, reason, booking_id) values (v_account_id, 1, 'cancel_refund', p_booking_id);
    v_refunded := true;
  end if;

  update bookings set status = 'cancelled' where id = p_booking_id;
  return v_refunded;
end;
$$;

-- Reschedule (F9): only offered ≥24h before the *current* start; the new slot must also be
-- bookable (≥24h out, ≤4 weeks ahead). Moves the slot in place — **does not touch the ledger**,
-- so it can't be used as a cancel/rebook round trip to dodge the 24h rule.
create function reschedule_booking(p_booking_id uuid, p_new_starts_at timestamptz)
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
  if v_booking.starts_at - now() < interval '24 hours' then
    raise exception 'too_late' using errcode = 'P0001';
  end if;
  if p_new_starts_at - now() < interval '24 hours' or p_new_starts_at - now() > interval '28 days' then
    raise exception 'new_slot_not_bookable' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_new_starts_at::text));
  if exists (select 1 from bookings where starts_at = p_new_starts_at and status <> 'cancelled' and id <> p_booking_id) then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  update bookings set starts_at = p_new_starts_at where id = p_booking_id;
end;
$$;

-- Admin marks a booking no-show (15 min late, F10/F12) — the credit stays spent (burned) unless a
-- later credit-return request is approved.
create function mark_no_show(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if not exists (select 1 from accounts a where a.id = v_admin_id and a.is_admin) then
    raise exception 'denied' using errcode = 'P0001';
  end if;

  update bookings set status = 'no_show' where id = p_booking_id and status = 'booked';
  if not found then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  insert into audit_log (actor_id, action, target, payload)
  values (v_admin_id, 'mark_no_show', p_booking_id::text, '{}'::jsonb);
end;
$$;

-- Buyer appeals a no-show (F10). Lands in the admin queue as `pending`.
create function request_credit_return(p_booking_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
  v_request_id uuid;
begin
  if not exists (select 1 from bookings where id = p_booking_id and account_id = v_account_id and status = 'no_show') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  insert into credit_return_requests (booking_id, account_id, reason)
  values (p_booking_id, v_account_id, p_reason)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

-- Admin approve/deny (F10). Approving writes exactly one ledger row and is audited.
create function resolve_credit_return_request(p_request_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_request credit_return_requests;
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

  if p_decision = 'approved' then
    insert into credit_ledger (account_id, delta, reason, booking_id)
    values (v_request.account_id, 1, 'noshow_return', v_request.booking_id);
  end if;

  update credit_return_requests set status = p_decision, resolved_at = now() where id = p_request_id;

  insert into audit_log (actor_id, action, target, payload)
  values (v_admin_id, 'resolve_credit_return_request', p_request_id::text, jsonb_build_object('decision', p_decision));
end;
$$;

grant execute on function cancel_booking(uuid) to authenticated;
grant execute on function reschedule_booking(uuid, timestamptz) to authenticated;
grant execute on function request_credit_return(uuid, text) to authenticated;
grant execute on function mark_no_show(uuid) to authenticated;
grant execute on function resolve_credit_return_request(uuid, text) to authenticated;
