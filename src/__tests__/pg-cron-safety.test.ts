import { describe, it, expect, beforeEach } from 'vitest';

/**
 * pg_cron Safety Tests (Bug #4)
 *
 * Verifies that the cleanup_stale_pending RPC:
 * - Reverses credits before deleting pending enrollments
 * - Uses SKIP LOCKED to avoid blocking concurrent transactions
 * - Logs cleanup activity
 */

describe('cleanup_stale_pending RPC (Migration 00027)', () => {
  let migrationSql: string;

  beforeEach(async () => {
    const { readFileSync } = await import('fs');
    migrationSql = readFileSync(
      new URL('../../supabase/migrations/00027_safe_pending_cleanup.sql', import.meta.url).pathname,
      'utf-8'
    );
  });

  it('creates cleanup_stale_pending function', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.cleanup_stale_pending()');
  });

  it('uses SECURITY DEFINER for admin-level access', () => {
    expect(migrationSql).toContain('SECURITY DEFINER');
  });

  it('sets search_path to public', () => {
    expect(migrationSql).toContain('SET search_path = public');
  });

  it('selects stale pending enrollments with FOR UPDATE SKIP LOCKED', () => {
    expect(migrationSql).toContain("status = 'pending'");
    expect(migrationSql).toContain("interval '30 minutes'");
    expect(migrationSql).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('checks credits_applied before reversing', () => {
    expect(migrationSql).toContain('credits_applied > 0');
    expect(migrationSql).toContain('credits_group_size_type IS NOT NULL');
  });

  it('calls reverse_credits for enrolled-with-credits rows', () => {
    expect(migrationSql).toContain('PERFORM reverse_credits');
  });

  it('deletes the enrollment after credit reversal', () => {
    // reverse_credits must come before DELETE
    const reversePos = migrationSql.indexOf('PERFORM reverse_credits');
    const deletePos = migrationSql.indexOf('DELETE FROM enrollments WHERE id = v_enrollment.id');
    expect(reversePos).toBeGreaterThan(0);
    expect(deletePos).toBeGreaterThan(reversePos);
  });

  it('logs cleanup count to admin_logs', () => {
    expect(migrationSql).toContain('admin_logs');
    expect(migrationSql).toContain('stale_pending_cleanup');
    expect(migrationSql).toContain('cleaned_count');
  });

  it('replaces the old raw DELETE cron job', () => {
    expect(migrationSql).toContain("cron.unschedule('cleanup-stale-pending')");
    expect(migrationSql).toContain('cron.schedule');
    expect(migrationSql).toContain('cleanup_stale_pending()');
  });

  it('runs every 5 minutes', () => {
    expect(migrationSql).toContain("'*/5 * * * *'");
  });

  it('does NOT contain raw DELETE without credit check', () => {
    // The old pattern was: DELETE FROM enrollments WHERE status = 'pending' AND created_at < ...
    // The new pattern wraps it in a function that checks credits first
    // Ensure the cron.schedule call uses the function, not raw DELETE
    const cronScheduleSection = migrationSql.slice(migrationSql.indexOf('cron.schedule'));
    expect(cronScheduleSection).toContain('cleanup_stale_pending()');
    expect(cronScheduleSection).not.toContain("DELETE FROM public.enrollments WHERE status = 'pending'");
  });
});

describe('Hardening Migration 00025 — Key SQL Patterns', () => {
  let sql: string;
  let renameSql: string;

  beforeEach(async () => {
    const { readFileSync } = await import('fs');
    sql = readFileSync(
      new URL('../../supabase/migrations/00025_hardening_fixes.sql', import.meta.url).pathname,
      'utf-8'
    );
    renameSql = readFileSync(
      new URL('../../supabase/migrations/00032_rename_modules_cohorts.sql', import.meta.url).pathname,
      'utf-8'
    );
  });

  it('reserve_seat validates agreement NOT NULL', () => {
    expect(renameSql).toContain('p_agreement_version IS NULL OR p_agreement_timestamp IS NULL');
    expect(renameSql).toContain('Agreement must be signed');
  });

  it('reserve_seat validates class-course relationship', () => {
    expect(renameSql).toContain('v_class_course_id != p_course_id');
    expect(renameSql).toContain('Class does not belong to the specified course');
  });

  it('reserve_seat checks class is active', () => {
    expect(renameSql).toContain('NOT v_class_active');
    expect(renameSql).toContain('Class is not active');
  });

  it('reserve_seat uses FOR UPDATE lock on class row', () => {
    expect(renameSql).toContain('FOR UPDATE OF c');
  });

  it('apply_credits uses FOR UPDATE lock on credit rows', () => {
    expect(sql).toContain('FOR UPDATE');
    // within apply_credits function
    const applyFunc = sql.slice(sql.indexOf('FUNCTION public.apply_credits'));
    expect(applyFunc).toContain('FOR UPDATE');
  });

  it('release_seat checks authorization', () => {
    expect(sql).toContain('Not authorized to release this enrollment');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('v_student_user_id');
    expect(sql).toContain('v_student_parent_id');
    expect(sql).toContain('is_admin()');
  });

  it('partial unique index allows re-enrollment after refund', () => {
    expect(renameSql).toContain('uq_student_course_active');
    expect(renameSql).toContain("WHERE status IN ('pending', 'active')");
  });

  it('waitlist partial unique index allows re-joining after expiry', () => {
    expect(renameSql).toContain('uq_waitlist_student_class_active');
    expect(renameSql).toContain("WHERE status IN ('waiting', 'notified')");
  });

  it('admin_set_role_parent uses SET LOCAL for session variable', () => {
    expect(sql).toContain("SET LOCAL app.bypass_role_check = 'true'");
  });

  it('admin_set_role_parent checks for active enrollments', () => {
    expect(sql).toContain('Cannot change role: user has active or pending enrollments');
  });

  it('parents can SELECT children user rows', () => {
    expect(sql).toContain('users_select_own');
    expect(sql).toContain('parent_id = auth.uid()');
  });
});
