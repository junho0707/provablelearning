-- 0013_first_session — assessment persistence + First-Session booking (TASK-FIRST-001/003).
--
-- `assessments`/`assessment_items` record the probe-and-descend walk (`strengths` mode) or which
-- test-prep set was assigned (`test_prep`); **never `class_help`**, which has no assessment at all
-- (ADR-005) — enforced by the check constraint, not just convention.
--
-- Booking the First Session is a **separate RPC**, not `book_session`: the $49 purchase is a flat
-- fee, not a spendable credit, so it must not call `spend_credit`. It links the booking to the
-- purchase instead, and a partial unique index stops the same First Session purchase from being
-- used to book twice.

create table assessments (
  id           uuid primary key default gen_random_uuid(),
  purchase_id  uuid not null references purchases (id),
  profile_id   uuid not null references learner_profiles (id),
  mode         text not null check (mode in ('strengths', 'test_prep')),
  test_slug    text, -- test_prep only: which hand-authored set (spec gap closed alongside 0012)
  completed_at timestamptz,
  created_at   timestamptz not null default now(),

  constraint test_slug_only_for_test_prep check (mode = 'test_prep' or test_slug is null)
);

create unique index assessments_one_per_purchase on assessments (purchase_id);

create table assessment_items (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references assessments (id) on delete cascade,
  question_id    uuid not null,
  node_id        text not null, -- roadmap node probed (strengths mode)
  is_correct     boolean not null,
  depth          int not null default 0,
  created_at     timestamptz not null default now()
);

create index assessment_items_assessment_idx on assessment_items (assessment_id);

alter table assessments enable row level security;
alter table assessment_items enable row level security;

create policy assessments_select_own on assessments for select using (
  exists (select 1 from purchases p where p.id = purchase_id and p.account_id = auth.uid())
);
create policy assessments_insert_own on assessments for insert with check (
  exists (select 1 from purchases p where p.id = purchase_id and p.account_id = auth.uid())
);
create policy assessments_update_own on assessments for update using (
  exists (select 1 from purchases p where p.id = purchase_id and p.account_id = auth.uid())
);

create policy assessment_items_select_own on assessment_items for select using (
  exists (
    select 1 from assessments a join purchases p on p.id = a.purchase_id
    where a.id = assessment_id and p.account_id = auth.uid()
  )
);
create policy assessment_items_insert_own on assessment_items for insert with check (
  exists (
    select 1 from assessments a join purchases p on p.id = a.purchase_id
    where a.id = assessment_id and p.account_id = auth.uid()
  )
);

grant select, insert, update on assessments to authenticated;
grant select, insert on assessment_items to authenticated;
grant all on assessments, assessment_items to service_role;

-- Book the First Session (F5): reserves the slot exactly like `book_session`, but the purchase
-- itself is the payment — no credit is spent. `p_purchase_id` must be the caller's own unused
-- `first_session` purchase.
create function book_first_session(p_profile_id uuid, p_starts_at timestamptz, p_purchase_id uuid)
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

  if not exists (
    select 1 from purchases where id = p_purchase_id and account_id = v_account_id and sku = 'first_session'
  ) then
    raise exception 'invalid_purchase' using errcode = 'P0001';
  end if;

  if exists (select 1 from bookings where purchase_id = p_purchase_id) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_starts_at::text));

  if exists (select 1 from bookings where starts_at = p_starts_at and status <> 'cancelled') then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  insert into bookings (account_id, profile_id, starts_at, purchase_id)
  values (v_account_id, p_profile_id, p_starts_at, p_purchase_id)
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

grant execute on function book_first_session(uuid, timestamptz, uuid) to authenticated;
