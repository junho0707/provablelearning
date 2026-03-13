import { describe, it, expect } from 'vitest';
import { checkEligibility } from '@/lib/enrollment/check-eligibility';

/**
 * Updated checkEligibility tests for the current API (post-rearchitecture).
 *
 * Current signature:
 *   checkEligibility(supabase, studentId, slot1ClassId, slot2ClassId?, slot3ClassId?, options?)
 *
 * Query sequence (slot 1 only, no slot 2/3):
 *   0: classes .single()                — fetch slot 1 class
 *   1: enrollments (dup slot 1)         — returns { data: [...] }
 *   2: enrollments (blocked slot 1)     — returns { data: [...] }
 *   3: enrollments (conflicts slot 1)   — returns { data: [...] }
 *
 * With slot 2:
 *   4: classes .single()                — fetch slot 2 class
 *   5: enrollments (slot 2 conflicts)   — returns { data: [...] }
 *   6: enrollments (dup slot 2)         — returns { data: [...] }
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
      { data: [{ id: 'existing-enr' }] }, // duplicate found
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Already enrolled');
  });

  it('rejects when class is blocked (Phase 2 drop)', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] }, // no dup
      { data: [{ id: 'blocked-enr' }] }, // blocked
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Re-enrollment');
  });

  it('rejects on time conflict', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] }, // no dup
      { data: [] }, // not blocked
      {
        data: [
          { class_id: 'other', classes: { meeting_day: 'Monday', meeting_time: '15:00:00' } },
        ],
      }, // conflict
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Time conflict');
  });

  it('allows eligible enrollment', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] }, // no dup
      { data: [] }, // not blocked
      { data: [] }, // no conflicts
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
      { data: null }, // slot 2 not found
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
      { data: { ...validSlot2, meeting_day: 'Monday' } }, // same day as slot 1
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id, slot2Id);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('different days');
  });

  it('rejects slot 2 time conflict', async () => {
    const supabase = createSupabaseMock([
      { data: validSlot1 },
      { data: [] },
      { data: [] },
      { data: [] },
      { data: validSlot2 },
      {
        data: [{ class_id: 'other', classes: { meeting_day: 'Thursday', meeting_time: '15:00:00' } }],
      }, // slot 2 conflict
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
      { data: [] }, // no slot 2 conflict
      { data: [{ id: 'dup-slot-2' }] }, // dup enrollment for slot 2
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
      { data: [] },
    ]);
    const result = await checkEligibility(supabase, studentId, slot1Id, slot2Id);
    expect(result.eligible).toBe(true);
  });
});
