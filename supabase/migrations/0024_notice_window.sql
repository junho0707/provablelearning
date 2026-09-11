-- 0024_notice_window — the booking floor and the free-cancellation window drop from 6 hours to 2.
--
-- `system/02-POLICIES.md` §2 and §3. One number governs both ends of the same decision, so the two
-- move together: a slot you may still book is a slot you may still cancel out of for free.
--
-- 0019 is already applied, so its text stays as written and these three functions are replaced
-- here rather than edited there. The 1-hour released-slot floor is unchanged — it is still the
-- shorter of the two, which is the property that matters (INV-BOOK-3).

create or replace function slot_min_notice(p_starts_at timestamptz)
returns interval
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from released_slots where starts_at = p_starts_at)
      then interval '1 hour'
    else interval '2 hours'
  end;
$$;

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

  if v_booking.starts_at - now() >= interval '2 hours' then
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
  if v_booking.starts_at - now() < interval '2 hours' then
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
