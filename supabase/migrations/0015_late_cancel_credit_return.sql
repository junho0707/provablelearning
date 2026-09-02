-- ADR-006. A cancellation inside 24 hours still burns the credit, but the buyer may now appeal it
-- through the same request → admin review → approve/deny path that already existed for no-shows.
--
-- `cancel_booking` records no "late" flag: a free cancel and a late cancel both land on
-- status = 'cancelled'. The only trace is the `cancel_refund` ledger row, written *only* when the
-- cancel was ≥24h out. So "the credit was burned" is exactly "cancelled with no cancel_refund row".
-- An approval writes `noshow_return`, never `cancel_refund`, so this test stays correct afterwards.

create or replace function request_credit_return(p_booking_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid := auth.uid();
  v_request_id uuid;
begin
  if not exists (
    select 1
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
      )
  ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  -- One live appeal per booking. A denied request may be resubmitted; a pending or already
  -- approved one may not, so an approval can never be claimed twice.
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

grant execute on function request_credit_return(uuid, text) to authenticated;
