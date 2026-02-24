-- ============================================================
-- RLS Policies
-- Users see own data, parents see children's data, admins see all
-- ============================================================

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$;

-- ============================================================
-- USERS
-- ============================================================
CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (
    id = auth.uid()
    OR id IN (SELECT user_id FROM public.students WHERE parent_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY users_update_own ON public.users
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY users_insert ON public.users
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY users_admin_all ON public.users
  FOR ALL USING (is_admin());

-- ============================================================
-- STUDENTS
-- ============================================================
CREATE POLICY students_select ON public.students
  FOR SELECT USING (
    user_id = auth.uid()
    OR parent_id = auth.uid()
    OR is_admin()
  );

CREATE POLICY students_insert ON public.students
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR parent_id = auth.uid()
    OR is_admin()
  );

CREATE POLICY students_update ON public.students
  FOR UPDATE USING (is_admin());

-- ============================================================
-- MODULES (public read, admin write)
-- ============================================================
CREATE POLICY modules_select ON public.modules
  FOR SELECT USING (true);

CREATE POLICY modules_admin_write ON public.modules
  FOR ALL USING (is_admin());

-- ============================================================
-- COHORTS (public read, admin write)
-- ============================================================
CREATE POLICY cohorts_select ON public.cohorts
  FOR SELECT USING (true);

CREATE POLICY cohorts_admin_write ON public.cohorts
  FOR ALL USING (is_admin());

-- ============================================================
-- ENROLLMENTS
-- ============================================================
CREATE POLICY enrollments_select ON public.enrollments
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid() OR parent_id = auth.uid()
    )
    OR is_admin()
  );

-- Enrollment INSERT goes through SECURITY DEFINER RPC (reserve_seat) only
-- No direct insert policy for regular users
CREATE POLICY enrollments_admin_all ON public.enrollments
  FOR ALL USING (is_admin());

-- ============================================================
-- WAITLIST
-- ============================================================
CREATE POLICY waitlist_select ON public.waitlist
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid() OR parent_id = auth.uid()
    )
    OR is_admin()
  );

CREATE POLICY waitlist_admin_all ON public.waitlist
  FOR ALL USING (is_admin());

-- ============================================================
-- PERFORMANCE_LOGS
-- ============================================================
CREATE POLICY perf_select ON public.performance_logs
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid() OR parent_id = auth.uid()
    )
    OR is_admin()
  );

CREATE POLICY perf_admin_write ON public.performance_logs
  FOR ALL USING (is_admin());

-- ============================================================
-- CREDITS
-- ============================================================
CREATE POLICY credits_select ON public.credits
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid() OR parent_id = auth.uid()
    )
    OR is_admin()
  );

CREATE POLICY credits_admin_write ON public.credits
  FOR ALL USING (is_admin());

-- ============================================================
-- ADMIN_LOGS
-- ============================================================
CREATE POLICY admin_logs_admin ON public.admin_logs
  FOR ALL USING (is_admin());
