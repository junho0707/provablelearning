-- 0020_session_work — what happens either side of the hour (ADR-007 §8/§9, system/03-FLOWS.md F6/F8).
--
-- This is the product. Everything before it was plumbing so that these four tables could exist:
-- what the student tells the tutor beforehand, what they upload, what the tutor writes afterwards,
-- and how far the student got through it.
--
-- Previously only the First Session had any of this. ADR-007 made it apply to every session,
-- because a tutor who is prepared and a student who leaves with material is what the customer is
-- actually buying.

-- ---------------------------------------------------------------------------------------------
-- A student can SEE their sessions without reading the bookings table
-- ---------------------------------------------------------------------------------------------

-- INV-ACTOR-1 denies students every booking row, and that is deliberate: they must never book,
-- cancel, or reschedule. But they do need to know when their session is and how to join it.
--
-- A security-definer view resolves the tension exactly. It exposes scheduling fields only — no
-- account id, no purchase, no credit — and its WHERE clause scopes rows to the signed-in student.
-- The invariant stays literally true: no student request reads `bookings`.
create view student_sessions as
select
  b.id,
  b.profile_id,
  b.starts_at,
  b.status,
  b.meet_url,
  b.purpose,
  b.sub_purpose,
  b.specifics,
  b.topic_mode
from bookings b
join learner_profiles p on p.id = b.profile_id
where p.auth_user_id = auth.uid()
  and p.login_active;

grant select on student_sessions to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Pre-session (F6)
-- ---------------------------------------------------------------------------------------------

create table pre_session_submissions (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null unique references bookings (id) on delete cascade,
  profile_id          uuid not null references learner_profiles (id) on delete cascade,
  -- The unit, the chapter, the test — whatever the purpose asked for.
  topic               text,
  -- The math-diagnostic purpose asks for both; captured per session because a student's class
  -- changes over a year and the profile's copy may be stale by the next booking.
  current_math_class  text,
  previous_math_class text,
  -- "What I'm stuck on", in the student's own words. The most useful field on the table.
  notes               text,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index pre_session_submissions_profile_idx on pre_session_submissions (profile_id);

create table session_uploads (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings (id) on delete cascade,
  -- Storage objects are keyed by profile id, so deleting a student's files is one prefix listing
  -- (see `deleteStudentUploads`). Keying by booking would make that deletion silently incomplete.
  profile_id    uuid not null references learner_profiles (id) on delete cascade,
  storage_path  text,
  file_name     text not null,
  content_type  text,
  size_bytes    int,
  -- A Google Docs link is an accepted alternative to a file (system/02-POLICIES.md §10), so
  -- exactly one of `storage_path` and `link_url` is set.
  link_url      text,
  uploaded_by   text not null check (uploaded_by in ('student', 'buyer')),
  created_at    timestamptz not null default now(),

  constraint session_uploads_file_or_link
    check ((storage_path is not null) <> (link_url is not null))
);

create index session_uploads_booking_idx on session_uploads (booking_id);
create index session_uploads_profile_idx on session_uploads (profile_id);

-- ---------------------------------------------------------------------------------------------
-- Post-session (F8)
-- ---------------------------------------------------------------------------------------------

create table post_session_materials (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null unique references bookings (id) on delete cascade,
  profile_id    uuid not null references learner_profiles (id) on delete cascade,
  -- Strengths and next steps, never deficits (system/00-BUSINESS.md §7).
  summary       text,
  -- What to learn next, in order.
  roadmap       text,
  explanations  text,
  -- Null until the tutor publishes. Drives the 24-hour target and the overdue queue.
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index post_session_materials_profile_idx on post_session_materials (profile_id);
create index post_session_materials_unpublished_idx on post_session_materials (created_at)
  where (published_at is null);

-- Practice questions attached to the material. Same answer-secrecy shape as `questions` (0002):
-- the answer is withheld by **column-level grant**, not by application code, so a student cannot
-- read it however they query.
create table material_items (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references post_session_materials (id) on delete cascade,
  position     int not null default 0,
  prompt       text not null,
  answer       text not null,
  explanation  text,
  created_at   timestamptz not null default now()
);

create index material_items_material_idx on material_items (material_id, position);

create table material_progress (
  id                uuid primary key default gen_random_uuid(),
  material_item_id  uuid not null references material_items (id) on delete cascade,
  profile_id        uuid not null references learner_profiles (id) on delete cascade,
  is_correct        boolean not null,
  answered_at       timestamptz not null default now(),

  unique (material_item_id, profile_id)
);

create index material_progress_profile_idx on material_progress (profile_id);

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------

alter table pre_session_submissions enable row level security;
alter table session_uploads         enable row level security;
alter table post_session_materials  enable row level security;
alter table material_items          enable row level security;
alter table material_progress       enable row level security;

-- The buyer owns the booking; the student is the one it is for. Both may read, and each writes
-- only what is theirs to write (`system/01-ACTORS.md`).
create policy pre_session_buyer_read on pre_session_submissions for select using (
  exists (select 1 from bookings b where b.id = booking_id and b.account_id = auth.uid())
);
create policy pre_session_student_all on pre_session_submissions for all using (
  profile_id = current_student_profile_id()
) with check (
  profile_id = current_student_profile_id()
);

create policy uploads_buyer_all on session_uploads for all using (
  exists (select 1 from bookings b where b.id = booking_id and b.account_id = auth.uid())
) with check (
  exists (select 1 from bookings b where b.id = booking_id and b.account_id = auth.uid())
);
create policy uploads_student_all on session_uploads for all using (
  profile_id = current_student_profile_id()
) with check (
  profile_id = current_student_profile_id()
);

-- Materials are visible to the buyer at any time (they can see everything delivered to their
-- students) but to the student **only once published** — half-written material would read as a
-- broken promise rather than work in progress.
create policy materials_buyer_read on post_session_materials for select using (
  exists (select 1 from bookings b where b.id = booking_id and b.account_id = auth.uid())
);
create policy materials_student_read on post_session_materials for select using (
  profile_id = current_student_profile_id() and published_at is not null
);

create policy material_items_read on material_items for select using (
  exists (
    select 1 from post_session_materials m
    where m.id = material_id
      and (
        exists (select 1 from bookings b where b.id = m.booking_id and b.account_id = auth.uid())
        or (m.profile_id = current_student_profile_id() and m.published_at is not null)
      )
  )
);

create policy material_progress_student_all on material_progress for all using (
  profile_id = current_student_profile_id()
) with check (
  profile_id = current_student_profile_id()
);
create policy material_progress_buyer_read on material_progress for select using (
  exists (
    select 1 from learner_profiles p where p.id = profile_id and p.account_id = auth.uid()
  )
);

-- Admin reads everything, for preparing and authoring.
create policy pre_session_admin on pre_session_submissions for select using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
create policy uploads_admin on session_uploads for select using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
create policy materials_admin on post_session_materials for all using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
) with check (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
create policy material_items_admin on material_items for all using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
) with check (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);
create policy material_progress_admin on material_progress for select using (
  exists (select 1 from accounts a where a.id = auth.uid() and a.is_admin)
);

-- ---------------------------------------------------------------------------------------------
-- Grants — note the withheld answer column
-- ---------------------------------------------------------------------------------------------

grant select, insert, update on pre_session_submissions to authenticated;
grant select, insert, delete on session_uploads to authenticated;
grant select on post_session_materials to authenticated;
grant select, insert, update on material_progress to authenticated;

-- `answer` is deliberately absent from this grant (INV-SECRET, same shape as 0002's `questions`).
-- A student may read the prompt and the explanation; only the service role reads the answer, so
-- checking happens server-side and cannot be short-circuited from the client.
grant select (id, material_id, position, prompt, explanation, created_at) on material_items to authenticated;

grant all on pre_session_submissions, session_uploads, post_session_materials, material_items, material_progress to service_role;

-- ---------------------------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------------------------

-- Private bucket; every read goes through a signed URL issued server-side after an ownership
-- check. Public objects would make a child's uploaded homework world-readable to anyone holding
-- the path.
insert into storage.buckets (id, name, public)
values ('session-uploads', 'session-uploads', false)
on conflict (id) do nothing;
