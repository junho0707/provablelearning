-- 0011_sms_worklist — manual SMS reminder queue (TASK-ADMIN-002, REQ-ADMIN-004).
--
-- Spec gap found during implementation: REQ-ADMIN-004 requires "the recipient's number" on the
-- worklist, but no phone field exists anywhere in `07_DATA_MODEL` (accounts has only `email`;
-- learner profiles deliberately have no contact info at all — INV-ACTOR-1). Smallest fix: an
-- optional `phone` on `accounts` (the buyer, who is who the reminder is actually for — they pay
-- and attend arrangements, per `04_ACTORS.md`), buyer-settable, absent from every reminder until
-- they provide one. Flag for a `spec/03_REQUIREMENTS.md` update; not resolved here, only unblocked.

alter table accounts add column phone text;
grant update (phone) on accounts to authenticated;

-- "Sent" is a manual worklist state (REQ-ADMIN-004: "a worklist, not an integration"), not proof
-- of delivery — the operator marks a text as sent after actually sending it by hand.
alter table bookings add column sms_sent boolean not null default false;

-- Admin marks a worklist entry sent — the entire point is a flag the admin controls, not a
-- system-computed one (unlike `reminded_24h`/`reminded_1h`, which are for the automated email cron).
create function mark_sms_sent(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin) then
    raise exception 'denied' using errcode = 'P0001';
  end if;
  update bookings set sms_sent = true where id = p_booking_id;
end;
$$;

grant execute on function mark_sms_sent(uuid) to authenticated;
