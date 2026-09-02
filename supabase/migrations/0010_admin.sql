-- 0010_admin — admin cross-account reads + the refund-adjustment RPC (TASK-ADMIN-001).
--
-- Every other table's RLS scopes a buyer to their own rows; admin surfaces need to read across
-- accounts (user list, bookings calendar, credit adjustments). Each of these is a second,
-- additive permissive policy — RLS OR's multiple permissive policies together, so the existing
-- owner-scoped policies are untouched. Referencing `accounts` inside its own policy is safe: the
-- subquery is evaluated under `accounts_select_own`, which already lets an admin read their own
-- `is_admin = true` row.

create policy accounts_admin_read on accounts for select using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
create policy learner_profiles_admin_read on learner_profiles for select using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
create policy bookings_admin_read on bookings for select using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
create policy purchases_admin_read on purchases for select using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
create policy credit_ledger_admin_read on credit_ledger for select using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);

-- Admin credit-adjustment (F13) — pairs with a manual Stripe refund so wallet and Stripe can't
-- drift (ADR-003). No self-serve refund path exists; this is admin-only and audited.
create function refund_credit(p_account_id uuid, p_amount int, p_note text)
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
  if p_amount = 0 then
    raise exception 'malformed' using errcode = 'P0001';
  end if;

  insert into credit_ledger (account_id, delta, reason) values (p_account_id, p_amount, 'admin_adjust');

  insert into audit_log (actor_id, action, target, payload)
  values (v_admin_id, 'refund_credit', p_account_id::text, jsonb_build_object('amount', p_amount, 'note', p_note));
end;
$$;

grant execute on function refund_credit(uuid, int, text) to authenticated;
