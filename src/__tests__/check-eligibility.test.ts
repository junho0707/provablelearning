import { describe, it, expect } from 'vitest';
import { checkEligibility } from '@/lib/enrollment/check-eligibility';

/**
 * Mock Supabase for checkEligibility.
 *
 * Query sequence (slot 1 only):
 *   0: classes (slot1 fetch)       .single()
 *   1: enrollments (dupEnrollment slot1)
 *   2: enrollments (blocked slot1)
 *   3: enrollments (active enrolls — prefetch for conflict detection)
 *   4: classes (bulk committed day/time) — ONLY if step 3 returned ≥ 1 row
 *   — slot 1 conflict check happens in memory —
 *
 * If slot2 provided:
 *   next: classes (slot2)         .single()
 *   — slot 2 conflict check in memory —
 *   next: enrollments (dup slot2)
 */
function createSupabaseMock(responses: Array<{ data?: unknown; count?: number | null; error?: unknown }>) {
  let fromCallCount = 0;

  return {
    from: () => {
      const idx = fromCallCount++;

      function makeChain(): unknown {
        return new Proxy({}, {
          get(_target, prop: string) {
            if (prop === 'then') {
              const resp = responses[idx] || { data: null, count: null };
              return (resolve: (v: unknown) => void) => resolve(resp);
            }
            if (prop === 'catch') return () => {};

            if (prop === 'single' || prop === 'maybeSingle') {
              return () => {
                const resp = responses[idx] || { data: null };
                return Promise.resolve(resp);
              };
            }

            return (..._args: unknown[]) => makeChain();
          },
        });
      }

      return makeChain();
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('checkEligibility', () => {
  const classId = 'cls-1';
  const studentId = 'stu-1';

  const validClass = {
    id: classId,
    name: 'Test Class',
    subject: null,
    level: null,
    group_size_type: 'small',
    meeting_day: 'Monday',
    meeting_time: '10:00',
    class_start_date: null,
  };

  it('rejects if class not found', async () => {
    const supabase = createSupabaseMock([
      { data: null },
    ]);
    const result = await checkEligibility(supabase, studentId, classId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Class not found');
  });

  it('rejects duplicate class enrollment', async () => {
    const supabase = createSupabaseMock([
      { data: validClass },
      { data: [{ id: 'enr-1' }] },
    ]);
    const result = await checkEligibility(supabase, studentId, classId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Already enrolled in this class');
  });

  it('rejects if re-enrollment blocked (Phase 2 drop)', async () => {
    const supabase = createSupabaseMock([
      { data: validClass },
      { data: [] },
      { data: [{ id: 'b1' }] },
    ]);
    const result = await checkEligibility(supabase, studentId, classId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Re-enrollment into this class is not available');
  });

  it('rejects LG class that has already started', async () => {
    const startedLgClass = {
      ...validClass,
      group_size_type: 'large',
      class_start_date: '2020-01-01',
    };
    const supabase = createSupabaseMock([
      { data: startedLgClass },
    ]);
    const result = await checkEligibility(supabase, studentId, classId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('already started');
  });

  it('rejects when new slot 1 conflicts with slot_1 of an existing enrollment', async () => {
    const supabase = createSupabaseMock([
      { data: validClass },                                           // slot1 class
      { data: [] },                                                    // no dup
      { data: [] },                                                    // no blocked
      { data: [{ class_id: 'other', slot_1_class_id: 'other' }] },    // active enrolls
      { data: [{ meeting_day: 'Monday', meeting_time: '10:00' }] },   // committed schedule
    ]);
    const result = await checkEligibility(supabase, studentId, classId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Time conflict');
  });

  it('rejects when new slot 1 conflicts with slot_2 of an existing dual-slot enrollment (regression for cross-slot conflict bug)', async () => {
    const supabase = createSupabaseMock([
      { data: validClass },
      { data: [] },
      { data: [] },
      { data: [{ class_id: 'mon-cls', slot_1_class_id: 'mon-cls', slot_2_class_id: 'mon-other' }] },
      // Committed includes a Monday 10:00 slot (from the student's slot_2). With the
      // old implementation this was invisible because the join used class_id only.
      { data: [
        { meeting_day: 'Thursday', meeting_time: '15:00' },  // slot_1 of existing
        { meeting_day: 'Monday',   meeting_time: '10:00' },  // slot_2 of existing — the conflict
      ] },
    ]);
    const result = await checkEligibility(supabase, studentId, classId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Time conflict');
  });

  it('allows eligible enrollment with no existing commitments', async () => {
    const supabase = createSupabaseMock([
      { data: validClass },
      { data: [] },
      { data: [] },
      { data: [] },  // no active enrolls → step 4 skipped
    ]);
    const result = await checkEligibility(supabase, studentId, classId);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('validates slot 2 when provided', async () => {
    const slot2ClassId = 'cls-2';
    const supabase = createSupabaseMock([
      { data: validClass },  // slot 1 class
      { data: [] },          // no dup slot 1
      { data: [] },          // no blocked
      { data: [] },          // no active enrolls → no committed fetch
      { data: null },        // slot 2 class not found
    ]);
    const result = await checkEligibility(supabase, studentId, classId, slot2ClassId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Slot 2 class not found');
  });
});
