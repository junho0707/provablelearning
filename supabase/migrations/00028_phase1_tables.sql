-- Phase 1: notifications, messages, office_hours, refund_requests

-- ============================================================
-- notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',  -- info, enrollment, makeup, admin
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, read) WHERE read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_insert_admin ON notifications;
CREATE POLICY notifications_insert_admin ON notifications
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- messages (student <-> tutor)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) <= 2000),
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_to_user ON messages (to_user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_from_user ON messages (from_user_id, created_at DESC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

DROP POLICY IF EXISTS messages_insert ON messages;
CREATE POLICY messages_insert ON messages
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

DROP POLICY IF EXISTS messages_update ON messages;
CREATE POLICY messages_update ON messages
  FOR UPDATE USING (auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = to_user_id);

DROP POLICY IF EXISTS messages_admin_select ON messages;
CREATE POLICY messages_admin_select ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- office_hours
-- ============================================================
CREATE TABLE IF NOT EXISTS office_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meet_link text NOT NULL,
  day_of_week text NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  start_time time NOT NULL,
  end_time time NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE office_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS office_hours_select ON office_hours;
CREATE POLICY office_hours_select ON office_hours
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS office_hours_admin ON office_hours;
CREATE POLICY office_hours_admin ON office_hours
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- refund_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(reason) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  admin_notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests (status) WHERE status = 'pending';

ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refund_requests_parent_select ON refund_requests;
CREATE POLICY refund_requests_parent_select ON refund_requests
  FOR SELECT USING (auth.uid() = parent_id);

DROP POLICY IF EXISTS refund_requests_parent_insert ON refund_requests;
CREATE POLICY refund_requests_parent_insert ON refund_requests
  FOR INSERT WITH CHECK (
    auth.uid() = parent_id
    AND EXISTS (
      SELECT 1 FROM enrollments e
      JOIN students s ON s.id = e.student_id
      WHERE e.id = enrollment_id
        AND s.parent_id = auth.uid()
        AND e.status = 'active'
    )
  );

DROP POLICY IF EXISTS refund_requests_admin ON refund_requests;
CREATE POLICY refund_requests_admin ON refund_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
