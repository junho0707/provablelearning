import { describe, it, expect } from 'vitest';
import { checkEligibility } from '@/lib/enrollment/check-eligibility';

/**
 * Query sequence for current checkEligibility (post cross-slot conflict fix):
 *   0: classes .single()                 — slot 1 class
 *   1: enrollments (dup slot 1)
 *   2: enrollments (blocked)
 *   3: enrollments (active — prefetch)
 *   4: classes (committed day/times)     — ONLY if step 3 returns ≥ 1 row
 *   5: classes .single()                 — slot 2 (if provided)
 *   6: enrollments (dup slot 2)
 */
function createSupabaseMock(
  responses: Array<{ data?: unknown; count?: number | null; error?: unknown }>
) {
  let fromCallCount = 0;

  return {
    from: (_table: string) => {
      const idx = fromCallCount++;

      function makeChain(): unknown {
        return new Proxy(
          {},
          {
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
          }
        );
      }

      return makeChain();
    },
  } as any;
}

const studentId = 'stu-1';
const slot1Id = 'cls-1';
const slot2Id = 'cls-2';

const validSlot1 = {
  id: slot1Id,
  name: 'SG Monday',
  subject: null,
  level: null,
  group_size_type: 'small',
  meeting_day: 'Monday',
  meeting_time: '15:00:00',
  class_start_date: '2026-04-01',
};

describe('checkEligibility — single slot', () => {
  it('rejects when class not found', async () => {
    const supabase = createSupabaseMock([{ data: null }]);
    const result = await checkEligibility(supabase, studentId, slot1Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Class not found');
  });

  it('rejects LG enrollment after class has started', async () => {
    const supabase = createSupabaseMock([
      {
        data: {
          ...validSlot1,
          group_size_type: 'large',
          class_start_date: '2020-01-01',
        },
      },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('already started');
  });

  it('rejects duplicate enrollment in same class', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [{ id: 'existing-enr' }] },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Already enrolled');
  });

  it('rejects when class is blocked (Phase 2 drop)', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [{ id: 'blocked-enr' }] },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Re-enrollment');
  });

  it('rejects on time conflict with existing slot_1', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [] },
      { data: [{ class_id: 'other', slot_1_class_id: 'other' }] },
      { data: [{ meeting_day: 'Monday', meeting_time: '15:00:00' }] },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Time conflict');
  });

  it('rejects on time conflict with existing slot_2 (cross-slot regression)', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [] },
      { data: [{ class_id: 'existing-slot1', slot_1_class_id: 'existing-slot1', slot_2_class_id: 'existing-slot2' }] },
      { data: [
        { meeting_day: 'Wednesday', meeting_time: '15:00:00' }, // student's slot_1
        { meeting_day: 'Monday',    meeting_time: '15:00:00' }, // student's slot_2 — conflicts with new slot_1
      ] },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Time conflict');
  });

  it('allows eligible enrollment', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [] },
      { data: [] },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id);
    expect(result.eligible).toBe(true);
  });
});

describe('checkEligibility — dual slot', () => {
  const validSlot2 = {
    id: slot2Id,
    group_size_type: 'small',
    meeting_day: 'Thursday',
    meeting_time: '15:00:00',
  };

  it('rejects when slot 2 class not found', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [] },
      { data: [] },
      { data: null },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id, slot2Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Slot 2 class not found');
  });

  it('rejects when slots have different group size types', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [] },
      { data: [] },
      { data: { ...validSlot2, group_size_type: 'one_on_one' } },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id, slot2Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('same group size type');
  });

  it('rejects when slot 1 and slot 2 are on the same day', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [] },
      { data: [] },
      { data: { ...validSlot2, meeting_day: 'Monday' } },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id, slot2Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('different days');
  });

  it('rejects slot 2 time conflict with an existing enrollment slot', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [] },
      { data: [{ class_id: 'ex', slot_1_class_id: 'ex' }] },
      { data: [{ meeting_day: 'Thursday', meeting_time: '15:00:00' }] }, // conflicts w/ slot 2
      { data: validSlot2 },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id, slot2Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Time conflict');
    expect(result.reason).toContain('slot 2');
  });

  it('rejects duplicate enrollment for slot 2', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [] },
      { data: [] },
      { data: validSlot2 },
      { data: [{ id: 'dup-slot-2' }] },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id, slot2Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Already enrolled in slot 2');
  });

  it('allows eligible dual-slot enrollment', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [] },
      { data: [] },
      { data: validSlot2 },
      { data: [] },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id, slot2Id);
    expect(result.eligible).toBe(true);
  });
});
