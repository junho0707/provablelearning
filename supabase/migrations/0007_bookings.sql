-- 0007_bookings — atomic booking RPC (TASK-BOOK-001).
--
-- Slots are derived, not stored (`0006_availability`), so there's no slot row to `SELECT ... FOR
-- UPDATE` before a booking exists for it. `book_session` uses the same advisory-lock pattern as
-- `spend_credit` (0004), keyed on the slot's instant, to serialize concurrent attempts at the same
-- slot (AT-BOOK-002). The partial unique index is the second, DB-level guarantee (INV-BOOK-1) —
-- true even if a future caller ever bypassed the RPC.

create table bookings (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references accounts (id) on delete cascade,
  profile_id         uuid not null references learner_profiles (id) on delete cascade,
  starts_at          timestamptz not null,
  status             text not null default 'booked' check (status in ('booked', 'cancelled', 'completed', 'no_show')),
  -- Set when this booking is the First Session (TASK-FIRST-001); null for a credit-pack booking.
  purchase_id        uuid references purchases (id),
  -- Nullable on purpose (INV-BOOK-2) — the Calendar event is created after this transaction
  -- commits (TASK-BOOK-003), so a Google outage leaves a valid booking with no link, not a lost
  -- booking (S10).
  meet_url           text,
  calendar_event_id  text,
  created_at         timestamptz not null default now()
);

-- INV-BOOK-1: at most one live (non-cancelled) booking per slot.
create unique index bookings_one_live_per_slot on bookings (starts_at) where (status <> 'cancelled');

create index bookings_account_idx on bookings (account_id);
create index bookings_profile_idx on bookings (profile_id);

-- Now that `bookings` exists, the ledger's `booking_id` reference can be enforced (0004 left it
-- nullable with no FK because this table didn't exist yet).
alter table credit_ledger add constraint credit_ledger_booking_fk foreign key (booking_id) references bookings (id);

alter table bookings enable row level security;

create policy bookings_select_own on bookings for select using (account_id = auth.uid());

grant select on bookings to authenticated;
grant all on bookings to service_role;

-- Reserve a slot + spend one credit, atomically (S7, AT-BOOK-001). `p_purchase_id` links a First
-- Session booking (TASK-FIRST-001); null for an ordinary credit-pack booking. The account is
-- `auth.uid()`, not a parameter — SECURITY DEFINER runs with elevated privilege, so trusting a
-- caller-supplied account id would let any authenticated caller book (and spend) on someone
-- else's wallet. `get_balance()`/`spend_credit()` establish the same pattern.
create function book_session(p_profile_id uuid, p_starts_at timestamptz, p_purchase_id uuid default null)
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

  -- Serializes concurrent attempts at the same slot — there's no row to lock until one exists.
  perform pg_advisory_xact_lock(hashtext(p_starts_at::text));

  if exists (select 1 from bookings where starts_at = p_starts_at and status <> 'cancelled') then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  insert into bookings (account_id, profile_id, starts_at, purchase_id)
  values (v_account_id, p_profile_id, p_starts_at, p_purchase_id)
  returning id into v_booking_id;

  -- Rolls back the whole transaction (including the insert above) if the balance is < 1 — the
  -- reservation and the spend either both happen or neither does.
  perform spend_credit(v_account_id, 'booking_spend', v_booking_id);

  return v_booking_id;
end;
$$;

grant execute on function book_session(uuid, timestamptz, uuid) to authenticated;
