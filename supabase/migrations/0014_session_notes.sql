-- 0014_session_notes — the raw material for the written plan (TASK-FIRST-002).
--
-- REQ-FIRST-006/007: a written plan delivered within 48h, producible **from session notes alone**
-- in the no-assessment (`class_help`) mode. `bookings` had no admin-write RLS policy at all
-- (every existing write goes through a `SECURITY DEFINER` RPC, CON2) — same pattern here.

alter table bookings add column session_notes text;

create function set_session_notes(p_booking_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin) then
    raise exception 'denied' using errcode = 'P0001';
  end if;
  update bookings set session_notes = p_notes where id = p_booking_id;
end;
$$;

grant execute on function set_session_notes(uuid, text) to authenticated;
