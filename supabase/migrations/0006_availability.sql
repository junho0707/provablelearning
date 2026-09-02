-- 0006_availability — recurring weekly template + exceptions (TASK-AVAIL-001).
--
-- Not Google-Calendar-derived — the calendar is written to, never read from (spec/14 §12), so a
-- Google outage can't break the booking path. No tutor dimension: the operator is solo
-- (ADR-003). Slots are **derived**, not stored — `src/lib/booking/slots.ts` materializes concrete
-- UTC instants from these rows at read time.

create table availability_rules (
  id         uuid primary key default gen_random_uuid(),
  weekday    int  not null check (weekday between 0 and 6), -- 0=Sunday..6=Saturday
  start_time time not null,
  end_time   time not null check (end_time > start_time),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table availability_exceptions (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  kind       text not null check (kind in ('blackout', 'extra')),
  -- null start/end on a blackout means the whole day; 'extra' rows always carry both.
  start_time time,
  end_time   time,
  created_at timestamptz not null default now(),

  constraint extra_needs_times check (kind <> 'extra' or (start_time is not null and end_time is not null)),
  constraint times_ordered check (start_time is null or end_time is null or end_time > start_time)
);

create index availability_exceptions_date_idx on availability_exceptions (date);

alter table availability_rules enable row level security;
alter table availability_exceptions enable row level security;

-- Any signed-in buyer needs to read availability to book (F8); only the admin writes it (F11).
create policy availability_rules_read on availability_rules for select using (auth.uid() is not null);
create policy availability_exceptions_read on availability_exceptions for select using (auth.uid() is not null);

create policy availability_rules_admin_write on availability_rules for all using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
) with check (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
create policy availability_exceptions_admin_write on availability_exceptions for all using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
) with check (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);

grant select on availability_rules, availability_exceptions to authenticated;
grant all on availability_rules, availability_exceptions to service_role;
