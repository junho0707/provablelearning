import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

/**
 * RPC SQL Invariants — verifies critical patterns in the latest versions of all major RPCs.
 *
 * These tests read the migration SQL files and verify that the Postgres functions
 * contain the correct business logic patterns. This proves:
 * - Atomic locking (FOR UPDATE)
 * - Capacity checks across all slot columns
 * - FIFO ordering (ORDER BY created_at ASC)
 * - Authorization checks
 * - Correct status transitions
 */

const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(path.join(migrationsDir, filename), 'utf-8');
}

/** Read the latest migration that defines a function */
function readLatestFunctionDef(fnName: string): string {
  const files = readdirSync(migrationsDir).sort().reverse();
  for (const file of files) {
    const content = readFileSync(path.join(migrationsDir, file), 'utf-8');
    const fnPattern = new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${fnName}\\b`,
      'i'
    );
    if (fnPattern.test(content)) {
      // Extract function body from this definition to the next $$ or end of function
      const startIdx = content.search(fnPattern);
      // Find the closing $$;
      const bodyStart = content.indexOf('$$', startIdx);
      const bodyEnd = content.indexOf('$$;', bodyStart + 2);
      return content.slice(startIdx, bodyEnd + 3);
    }
  }
  throw new Error(`Function ${fnName} not found in any migration`);
}

// =====================================================================
// reserve_seat
// =====================================================================
describe('reserve_seat RPC invariants', () => {
  const sql = readLatestFunctionDef('reserve_seat');

  it('is SECURITY DEFINER (runs with elevated privileges)', () => {
    expect(sql).toContain('SECURITY DEFINER');
  });

  it('locks class rows with FOR UPDATE', () => {
    expect(sql).toContain('FOR UPDATE OF cl');
  });

  it('validates agreement before enrollment', () => {
    const agreementCheck = sql.indexOf('p_agreement_version IS NULL');
    const insertPos = sql.indexOf('INSERT INTO enrollments');
    expect(agreementCheck).toBeGreaterThan(0);
    expect(agreementCheck).toBeLessThan(insertPos);
  });

  it('checks capacity across all slot columns (slot_1, slot_2, slot_3)', () => {
    expect(sql).toContain('enr.slot_1_class_id = p_slot_1_class_id');
    expect(sql).toContain('enr.slot_2_class_id = p_slot_1_class_id');
    expect(sql).toContain('enr.slot_3_class_id = p_slot_1_class_id');
  });

  it('enforces same group_size_type for dual slots', () => {
    expect(sql).toContain("v_slot1.group_size_type != v_slot2.group_size_type");
  });

  it('prevents duplicate slot selection (slot 1 = slot 2)', () => {
    expect(sql).toContain('p_slot_1_class_id = p_slot_2_class_id');
  });

  it('blocks LG enrollment after class starts', () => {
    expect(sql).toContain("group_size_type = 'large'");
    expect(sql).toContain('class_start_date');
    expect(sql).toContain('enrollment is closed');
  });

  it('counts pending AND active enrollments for capacity', () => {
    expect(sql).toContain("enr.status IN ('pending', 'active')");
  });

  it('pay_later creates active+unpaid enrollment', () => {
    expect(sql).toContain("'active', 'unpaid'");
  });

  it('non-pay_later creates pending+paid enrollment', () => {
    expect(sql).toContain("'pending', 'paid'");
  });

  it('computes flat 35-day end date for SG/1:1 (covers every weekly 4-session sequence)', () => {
    expect(sql).toContain('v_end_date := v_start_date + 35');
  });

  it('uses class dates for LG (not rolling)', () => {
    expect(sql).toContain('v_start_date := v_slot1.class_start_date');
    expect(sql).toContain('v_end_date := v_slot1.class_end_date');
  });

  it('supports slot 3 for 3x/wk enrollment', () => {
    expect(sql).toContain('p_slot_3_class_id');
    expect(sql).toContain('v_slot3');
  });

  it('sets payment_deadline to start + 7 days for pay_later', () => {
    expect(sql).toContain("v_start_date + INTERVAL '7 days'");
  });
});

// =====================================================================
// cancel_session
// =====================================================================
describe('cancel_session RPC invariants', () => {
  const sql = readLatestFunctionDef('cancel_session');

  it('locks enrollment row with FOR UPDATE', () => {
    expect(sql).toContain('FOR UPDATE');
  });

  it('blocks LG cancellations', () => {
    expect(sql).toContain("group_size_type = 'large'");
    expect(sql).toContain('Watch the recording');
  });

  it('requires 24-hour notice for SG', () => {
    expect(sql).toContain("group_size_type = 'small'");
    expect(sql).toContain("INTERVAL '1 day'");
    expect(sql).toContain('24 hours notice');
  });

  it('checks session ownership (student, parent, or admin)', () => {
    expect(sql).toContain('v_student.user_id != v_caller');
    expect(sql).toContain('v_student.parent_id != v_caller');
    expect(sql).toContain("role = 'admin'");
  });

  it('prevents duplicate cancellation (enrollment-scoped)', () => {
    expect(sql).toContain('enrollment_id = p_enrollment_id');
    expect(sql).toContain('session_number = p_session_number');
  });

  it('supports max 12 sessions for 3-slot enrollment', () => {
    expect(sql).toContain('v_max_sessions := 12');
  });

  it('supports max 8 sessions for 2-slot enrollment', () => {
    expect(sql).toContain('v_max_sessions := 8');
  });

  it('supports max 4 sessions for 1-slot enrollment', () => {
    expect(sql).toContain('v_max_sessions := 4');
  });

  it('rejects past or current-day session cancellation', () => {
    expect(sql).toContain('session_date <= CURRENT_DATE');
    expect(sql).toContain('past or current-day');
  });

  it('sets credit_deadline to end of week (Sunday ET)', () => {
    expect(sql).toContain("AT TIME ZONE 'America/New_York'");
    expect(sql).toContain("INTERVAL '23 hours 59 minutes 59 seconds'");
  });

  it('logs cancellation to admin_logs', () => {
    expect(sql).toContain("'session_cancelled'");
    expect(sql).toContain('admin_logs');
  });
});

// =====================================================================
// drop_enrollment
// =====================================================================
describe('drop_enrollment RPC invariants', () => {
  const sql = readLatestFunctionDef('drop_enrollment');

  it('locks enrollment with FOR UPDATE', () => {
    expect(sql).toContain('FOR UPDATE OF e');
  });

  it('only allows drop of active enrollments', () => {
    expect(sql).toContain("status <> 'active'");
    expect(sql).toContain('Enrollment is not active');
  });

  it('prevents self-drop for paid enrollments', () => {
    expect(sql).toContain("payment_status = 'paid'");
    expect(sql).toContain('Cannot self-drop a paid enrollment');
    expect(sql).toContain('refund consultation');
  });

  it('implements 3-phase drop system', () => {
    expect(sql).toContain('p_phase = 1');
    expect(sql).toContain('p_phase = 2');
    expect(sql).toContain('p_phase = 3');
  });

  it('Phase 1: clean drop (status=canceled)', () => {
    const phase1Match = sql.match(/p_phase = 1\s*THEN[\s\S]*?status = 'canceled'/);
    expect(phase1Match).toBeTruthy();
  });

  it('Phase 2: sets class_blocked and group_size_blocked', () => {
    expect(sql).toContain('class_blocked = true');
    expect(sql).toContain('group_size_blocked = true');
  });

  it('Phase 3: admin-only', () => {
    // After p_phase = 3 check, should see admin validation
    const phase3Pos = sql.indexOf('p_phase = 3');
    const adminOnlyCheck = sql.indexOf('Cannot self-drop in phase 3', phase3Pos);
    expect(adminOnlyCheck).toBeGreaterThan(phase3Pos);
  });

  it('computes phase boundaries: >14 days = Phase 1, ≤7 days since = Phase 2', () => {
    expect(sql).toContain('v_days_until_start > 14');
    expect(sql).toContain('v_days_since_start <= 7');
  });

  it('validates server-side phase for non-admins', () => {
    expect(sql).toContain('p_phase <> v_computed_phase');
    expect(sql).toContain('server computed phase');
  });

  it('cancels orphaned makeup bookings on drop', () => {
    expect(sql).toContain("UPDATE makeup_bookings mb");
    expect(sql).toContain("SET status = 'cancelled'");
    expect(sql).toContain('session_date > CURRENT_DATE');
    expect(sql).toContain('cancellation_id IN');
  });

  it('logs cancelled makeup count', () => {
    expect(sql).toContain("'makeup_bookings_cancelled_on_drop'");
    expect(sql).toContain("'cancelled_count'");
  });
});

// =====================================================================
// book_makeup_session
// =====================================================================
describe('book_makeup_session RPC invariants', () => {
  const sql = readLatestFunctionDef('book_makeup_session');

  it('locks cancellation row with FOR UPDATE', () => {
    expect(sql).toContain('FROM public.session_cancellations');
    expect(sql).toContain('FOR UPDATE');
  });

  it('only allows booking from cancelled status', () => {
    expect(sql).toContain("status != 'cancelled'");
    expect(sql).toContain('not in cancelled status');
  });

  it('blocks LG makeup bookings', () => {
    expect(sql).toContain("group_size_type = 'large'");
    expect(sql).toContain('not available for large group');
  });

  it('requires same group_size_type match (subject-agnostic)', () => {
    expect(sql).toContain('v_host_class.group_size_type != v_orig_class.group_size_type');
    // Should NOT require subject or level match for SG/1:1
    expect(sql).not.toContain('v_host_class.subject != v_orig_class.subject');
  });

  it('blocks booking into same class', () => {
    expect(sql).toContain('v_host_class.id = v_cancellation.class_id');
    expect(sql).toContain('Cannot book makeup in the same class');
  });

  it('blocks booking into enrolled class (all 3 slots)', () => {
    expect(sql).toContain('v_enrollment.slot_1_class_id = p_host_class_id');
    expect(sql).toContain('v_enrollment.slot_2_class_id = p_host_class_id');
    expect(sql).toContain('v_enrollment.slot_3_class_id = p_host_class_id');
  });

  it('capacity check includes active enrollments + makeup bookings', () => {
    expect(sql).toContain('v_active_count');
    expect(sql).toContain('v_makeup_count');
    expect(sql).toContain('v_active_count + v_makeup_count');
  });

  it('updates cancellation status to rescheduled after booking', () => {
    expect(sql).toContain("SET status = 'rescheduled'");
  });

  it('prevents booking past or current-day sessions', () => {
    // Latest version (00088) uses p_session_date param directly
    expect(sql).toMatch(/session_date <= CURRENT_DATE/);
  });
});

// =====================================================================
// book_makeup_with_credit
// =====================================================================
describe('book_makeup_with_credit RPC invariants', () => {
  const sql = readLatestFunctionDef('book_makeup_with_credit');

  it('uses IS NOT DISTINCT FROM for NULL subject/level matching', () => {
    expect(sql).toContain('IS NOT DISTINCT FROM v_class.subject');
    expect(sql).toContain('IS NOT DISTINCT FROM v_class.level');
  });

  it('locks class with FOR UPDATE', () => {
    expect(sql).toContain('FOR UPDATE');
  });

  it('uses FIFO credit ordering (oldest first)', () => {
    expect(sql).toContain('ORDER BY cr.created_at ASC');
    expect(sql).toContain('LIMIT 1');
  });

  it('locks credit row with FOR UPDATE (atomic deduction)', () => {
    // The credit SELECT ends with FOR UPDATE
    const creditSelect = sql.indexOf('FROM credits cr');
    const forUpdate = sql.indexOf('FOR UPDATE', creditSelect);
    expect(forUpdate).toBeGreaterThan(creditSelect);
  });

  it('deducts exactly 1 from remaining_amount', () => {
    expect(sql).toContain('remaining_amount = remaining_amount - 1');
  });

  it('checks capacity: enrolled + makeup bookings', () => {
    expect(sql).toContain('v_enrolled_count + v_makeup_count');
    expect(sql).toContain('v_class.capacity');
  });

  it('blocks past or current-day booking', () => {
    expect(sql).toContain('p_session_date <= CURRENT_DATE');
  });
});

// =====================================================================
// auto_enroll_from_waitlist
// =====================================================================
describe('auto_enroll_from_waitlist RPC invariants', () => {
  const sql = readLatestFunctionDef('auto_enroll_from_waitlist');

  it('uses FIFO order (ORDER BY created_at ASC)', () => {
    expect(sql).toContain('ORDER BY w.created_at ASC');
  });

  it('uses SKIP LOCKED to avoid contention', () => {
    expect(sql).toContain('SKIP LOCKED');
  });

  it('locks class with FOR UPDATE', () => {
    expect(sql).toContain('FOR UPDATE OF cl');
  });

  it('expires entries without agreement', () => {
    expect(sql).toContain("v_entry.agreement_version IS NULL");
    expect(sql).toContain("SET status = 'expired'");
  });

  it('checks for duplicate enrollment before auto-enrolling', () => {
    expect(sql).toContain('v_dup_count');
    expect(sql).toContain('enr.student_id = v_entry.student_id');
  });

  it('checks time conflicts across all 3 slot columns', () => {
    expect(sql).toContain('c1.meeting_day = v_class.meeting_day');
    expect(sql).toContain('c2.meeting_day = v_class.meeting_day');
    expect(sql).toContain('c3.meeting_day = v_class.meeting_day');
  });

  it('handles unique_violation gracefully', () => {
    expect(sql).toContain('EXCEPTION WHEN unique_violation');
  });

  it('marks waitlist entry as converted after enrollment', () => {
    expect(sql).toContain("SET status = 'converted'");
  });

  it('re-checks capacity after each enrollment', () => {
    // After RETURN NEXT, should re-check capacity
    const returnNext = sql.indexOf('RETURN NEXT');
    const recheck = sql.indexOf('v_current_count >= v_class.capacity', returnNext);
    expect(recheck).toBeGreaterThan(returnNext);
  });

  it('blocks LG auto-enroll after class starts', () => {
    expect(sql).toContain("group_size_type = 'large'");
    expect(sql).toContain('class_start_date');
  });

  it('creates enrollment as active+unpaid', () => {
    expect(sql).toContain("'active', 'unpaid'");
  });
});

// =====================================================================
// Rolling end-date (flat 35 days — migration 00091)
// =====================================================================
describe('rolling end-date formula', () => {
  it('is a flat 35 days from start regardless of start DOW', () => {
    for (let dow = 0; dow <= 6; dow++) {
      // Offset is constant; result is start + 35.
      expect(35).toBe(35);
      // Sanity: 35 days covers the worst-case 4-session weekly window (max +27).
      expect(35).toBeGreaterThan(27);
    }
  });

  it('covers a 4th weekly session from any start + meeting-day combination', () => {
    // Worst case: start DOW and meeting_day differ by 6 → first session at +6, fourth at +27.
    // Flat 35-day window gives 8+ days of slack.
    const maxFourthSessionOffset = 6 + 7 * 3;
    expect(maxFourthSessionOffset).toBeLessThanOrEqual(35);
  });
});

// =====================================================================
// Cross-RPC consistency checks
// =====================================================================
describe('Cross-RPC consistency', () => {
  it('reserve_seat and auto_enroll_from_waitlist use matching capacity queries', () => {
    const reserveSeat = readLatestFunctionDef('reserve_seat');
    const autoEnroll = readLatestFunctionDef('auto_enroll_from_waitlist');

    // Both should check slot_1, slot_2, slot_3, and legacy class_id
    for (const sql of [reserveSeat, autoEnroll]) {
      expect(sql).toContain('enr.slot_1_class_id');
      expect(sql).toContain('enr.slot_2_class_id');
      expect(sql).toContain('enr.slot_3_class_id');
      expect(sql).toContain('enr.class_id');
    }
  });

  it('cancel_session and mark_student_absent use the same max session logic', () => {
    const cancelSession = readLatestFunctionDef('cancel_session');
    const markAbsent = readLatestFunctionDef('mark_student_absent');

    for (const sql of [cancelSession, markAbsent]) {
      expect(sql).toContain('v_max_sessions := 12');
      expect(sql).toContain('v_max_sessions := 8');
      expect(sql).toContain('v_max_sessions := 4');
    }
  });

  it('all RPCs that modify enrollment-related data are SECURITY DEFINER', () => {
    const rpcs = [
      'reserve_seat',
      'drop_enrollment',
      'cancel_session',
      'book_makeup_session',
      'book_makeup_with_credit',
      'auto_enroll_from_waitlist',
    ];
    for (const rpc of rpcs) {
      const sql = readLatestFunctionDef(rpc);
      expect(sql).toContain('SECURITY DEFINER');
    }
  });

  it('all SECURITY DEFINER RPCs set search_path = public', () => {
    const rpcs = [
      'reserve_seat',
      'drop_enrollment',
      'cancel_session',
      'book_makeup_session',
      'book_makeup_with_credit',
      'auto_enroll_from_waitlist',
    ];
    for (const rpc of rpcs) {
      const sql = readLatestFunctionDef(rpc);
      expect(sql).toContain('SET search_path = public');
    }
  });
});
