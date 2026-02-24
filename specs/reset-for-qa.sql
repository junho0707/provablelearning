-- ============================================
-- RESET FOR QA: Keep admin only, clear everything else
-- Run as a single block in Supabase SQL Editor
-- ============================================

-- 1. Clear all transactional data
TRUNCATE enrollments CASCADE;
TRUNCATE waitlist CASCADE;
TRUNCATE credits CASCADE;
TRUNCATE session_cancellations CASCADE;
TRUNCATE makeup_bookings CASCADE;
TRUNCATE makeup_waitlist CASCADE;
TRUNCATE waitlist_notify_queue CASCADE;
TRUNCATE performance_logs CASCADE;
TRUNCATE admin_logs CASCADE;
TRUNCATE notifications CASCADE;
TRUNCATE messages CASCADE;
TRUNCATE bookings CASCADE;

-- 2. Clear courses + classes (CASCADE handles FKs)
TRUNCATE courses CASCADE;

-- 3. Clear all non-admin users + students
TRUNCATE students CASCADE;
DELETE FROM public.users WHERE role <> 'admin';

-- 4. Clear non-admin auth users
DELETE FROM auth.identities
WHERE user_id NOT IN (
  SELECT id FROM public.users WHERE role = 'admin'
);
DELETE FROM auth.users
WHERE id NOT IN (
  SELECT id FROM public.users WHERE role = 'admin'
);

-- 5. Verify only admin remains
SELECT id, role, full_name FROM public.users;
