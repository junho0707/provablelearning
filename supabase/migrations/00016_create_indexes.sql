-- Performance indexes
CREATE INDEX idx_enrollments_cohort_status ON enrollments(cohort_id, status);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_module ON enrollments(module_id);
CREATE INDEX idx_enrollments_status ON enrollments(status);
CREATE INDEX idx_enrollments_stripe_session ON enrollments(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

CREATE INDEX idx_students_parent ON students(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_students_user ON students(user_id);

CREATE INDEX idx_waitlist_cohort_status ON waitlist(cohort_id, status);
CREATE INDEX idx_waitlist_student ON waitlist(student_id);

CREATE INDEX idx_performance_student_module ON performance_logs(student_id, module_id);

CREATE INDEX idx_credits_student ON credits(student_id);
CREATE INDEX idx_credits_expires ON credits(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_admin_logs_admin ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_action ON admin_logs(action);

CREATE INDEX idx_modules_subject ON modules(subject);
CREATE INDEX idx_modules_dates ON modules(start_date, end_date);

CREATE INDEX idx_cohorts_module ON cohorts(module_id);
