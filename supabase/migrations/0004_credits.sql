-- 0004_credits — ledger, purchases, stripe idempotency, spend RPC (TASK-CREDIT-001).
--
-- `credit_ledger` is append-only; balance is always Σdelta, never a stored counter (07_DATA_MODEL,
-- INV-MONEY-1). `purchases` records what was bought; a partial unique index enforces "at most one
-- First Session per account" (INV-MONEY-2, ADR-005) under concurrency, not just at the app layer.
-- `stripe_events` is the webhook-redelivery idempotency guard (INV-MONEY-3).

create table purchases (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references accounts (id) on delete cascade,
  sku               text not null check (sku in ('first_session', 'credits_1', 'credits_2', 'credits_4', 'credits_8')),
  amount_cents      int  not null check (amount_cents > 0),
  -- First Session only (ADR-005). Null for credit packs.
  goal              text check (goal in ('strengths', 'test_prep', 'class_help')),
  stripe_session_id text not null unique,
  created_at        timestamptz not null default now()
);

-- INV-MONEY-2: at most one First Session purchase per account, enforced under concurrency.
create unique index purchases_one_first_session_per_account
  on purchases (account_id) where (sku = 'first_session');

create index purchases_account_idx on purchases (account_id);

create table credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  delta      int  not null check (delta <> 0),
  reason     text not null check (reason in ('purchase', 'booking_spend', 'cancel_refund', 'noshow_return', 'admin_adjust')),
  -- Booking table lands in TASK-AVAIL-001/BOOK-001; nullable now, FK added when it exists.
  booking_id uuid,
  created_at timestamptz not null default now()
);

create index credit_ledger_account_idx on credit_ledger (account_id);

-- INV-MONEY-3: redelivery of the same Stripe event is a no-op. Insert-first on this table is the guard.
create table stripe_events (
  event_id     text primary key,
  processed_at timestamptz not null default now()
);

alter table purchases enable row level security;
alter table credit_ledger enable row level security;
alter table stripe_events enable row level security;

-- A buyer reads only their own purchases/ledger rows. All writes go through SECURITY DEFINER RPCs
-- below (CON2, NFR-SEC-002) — no direct client insert/update/delete grant on either table.
create policy purchases_select_own on purchases for select using (account_id = auth.uid());
create policy credit_ledger_select_own on credit_ledger for select using (account_id = auth.uid());

grant select on purchases to authenticated;
grant select on credit_ledger to authenticated;
grant all on purchases, credit_ledger, stripe_events to service_role;

-- Caller's current balance (AT-CREDIT-001). SECURITY INVOKER (the default) — runs as the caller,
-- so the `credit_ledger_select_own` RLS policy scopes it exactly like a direct select would.
create function get_balance()
returns int
language sql
stable
as $$
  select coalesce(sum(delta), 0)::int from credit_ledger where account_id = auth.uid();
$$;

-- Spend one credit, enforcing INV-MONEY-1 (balance never negative) under concurrent spend
-- (AT-CREDIT-002, AT-BOOK-002). `pg_advisory_xact_lock` serializes concurrent spends for the same
-- account within the transaction — the append-only ledger has no row to `SELECT ... FOR UPDATE`,
-- so an advisory lock keyed on the account id is the equivalent guard. Held only for the
-- transaction's duration (auto-released on commit/rollback).
create function spend_credit(p_account_id uuid, p_reason text, p_booking_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  perform pg_advisory_xact_lock(hashtext(p_account_id::text));

  select coalesce(sum(delta), 0) into v_balance from credit_ledger where account_id = p_account_id;
  if v_balance < 1 then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into credit_ledger (account_id, delta, reason, booking_id)
  values (p_account_id, -1, p_reason, p_booking_id);
end;
$$;

-- Process one Stripe checkout completion, idempotently (INV-MONEY-3). `p_credits` is looked up
-- from `src/lib/pricing.ts` server-side before calling this, not duplicated in SQL — pricing has
-- exactly one source of truth (TASK-CONFIG-001).
create function process_purchase(
  p_event_id          text,
  p_account_id        uuid,
  p_sku               text,
  p_amount_cents      int,
  p_credits           int,
  p_goal              text,
  p_stripe_session_id text
)
returns boolean -- true iff this call actually processed the event; false on a redelivery no-op
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Idempotency guard: if this event was already processed, do nothing (redelivery is a no-op).
  begin
    insert into stripe_events (event_id) values (p_event_id);
  exception when unique_violation then
    return false;
  end;

  insert into purchases (account_id, sku, amount_cents, goal, stripe_session_id)
  values (p_account_id, p_sku, p_amount_cents, p_goal, p_stripe_session_id);

  if p_credits > 0 then
    insert into credit_ledger (account_id, delta, reason)
    values (p_account_id, p_credits, 'purchase');
  end if;

  return true;
end;
$$;

grant execute on function get_balance() to authenticated;
grant execute on function spend_credit(uuid, text, uuid) to service_role;
grant execute on function process_purchase(text, uuid, text, int, int, text, text) to service_role;
