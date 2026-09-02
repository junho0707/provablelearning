-- 0022_messages — buyer ↔ tutor messaging (system/03-FLOWS.md F11, system/04-DATA.md §8).
--
-- One thread per buyer, so there is no thread table: the buyer's account id *is* the thread key.
-- A separate `threads` row would carry no information that `account_id` does not already carry,
-- and would make "the tutor's inbox" a join instead of a group-by.
--
-- **Students have no access at all** (INV-ACTOR-1). There is deliberately no student policy on
-- this table and none should ever be added — a student has no `accounts` row, so the buyer policy
-- below already denies them, and the absence of a student policy is what keeps that true after
-- someone adds a scoped view somewhere else.

create table messages (
  -- The thread. Every row for one account is that account's single conversation with the tutor.
  account_id  uuid not null references accounts (id) on delete cascade,
  id          uuid primary key default gen_random_uuid(),
  -- Who wrote it. Not derivable from `account_id`, which names the thread rather than the author.
  sender      text not null check (sender in ('buyer', 'tutor')),
  body        text not null check (length(btrim(body)) > 0),
  -- Read by the *other* party: a tutor reply is unread until the buyer opens the thread, and a
  -- buyer message is unread until the operator works the inbox. One column serves both because a
  -- row only ever has one reader.
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index messages_thread_idx on messages (account_id, created_at);
-- The operator's inbox is "threads with something unread from the buyer", which is this.
create index messages_unread_idx on messages (created_at) where (read_at is null);

alter table messages enable row level security;

-- The buyer reads their own thread and writes only as `buyer` — the `with check` on `sender` is
-- what stops a buyer forging a message that appears to come from the tutor.
create policy messages_buyer_read on messages for select using (
  account_id = auth.uid()
);
create policy messages_buyer_insert on messages for insert with check (
  account_id = auth.uid() and sender = 'buyer'
);
-- Marking a tutor reply read is the only update a buyer makes.
create policy messages_buyer_update on messages for update using (
  account_id = auth.uid()
) with check (
  account_id = auth.uid()
);

create policy messages_admin_all on messages for all using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
) with check (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);

grant select, insert, update on messages to authenticated;
grant all on messages to service_role;
