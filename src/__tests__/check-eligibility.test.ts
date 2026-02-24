import { describe, it, expect } from 'vitest';
import { checkEligibility } from '@/lib/enrollment/check-eligibility';

/**
 * Mock Supabase for checkEligibility.
 *
 * checkEligibility makes 6 sequential queries:
 *   0: enrollments (dupClass)    — count, no .single()
 *   1: enrollments (dupCourse)   — count, no .single()
 *   2: courses                   — .single()
 *   3: enrollments (reenroll)    — count, no .single()
 *   4: classes                   — .single()
 *   5: enrollments (conflicts)   — no .single(), returns { data: [...] }
 *
 * The mock tracks .from() calls and returns the right response.
 */
function createSupabaseMock(responses: Array<{ data?: unknown; count?: number | null; error?: unknown }>) {
  let fromCallCount = 0;

  return {
    from: (_table: string) => {
      const idx = fromCallCount++;

      function makeChain(): unknown {
        return new Proxy({}, {
          get(_target, prop: string) {
            // Make chain thenable — resolves to the response for this query
            if (prop === 'then') {
              const resp = responses[idx] || { data: null, count: null };
              return (resolve: (v: unknown) => void) => resolve(resp);
            }
            if (prop === 'catch') return () => {};

            // .single() also resolves
            if (prop === 'single' || prop === 'maybeSingle') {
              return () => {
                const resp = responses[idx] || { data: null };
                return Promise.resolve(resp);
              };
            }

            // All other chain methods return the chain
            return (..._args: unknown[]) => makeChain();
          },
        });
      }

      return makeChain();
    },
  } as any;
}

describe('checkEligibility', () => {
  const courseId = 'crs-1';
  const classId = 'cls-1';
  const studentId = 'stu-1';

  const validCourse = {
    start_date: '2099-01-01',
    subject: 'digital_rw',
    max_reenroll: 3,
  };
  const validClass = {
    meeting_day: 'Monday',
    meeting_time: '10:00',
    course_id: courseId,
  };

  it('rejects duplicate class enrollment', async () => {
    const supabase = createSupabaseMock([
      { count: 1 }, // dupClass: found
    ]);

    const result = await checkEligibility(supabase, studentId, classId, courseId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Already enrolled in this class');
  });

  it('rejects duplicate course enrollment', async () => {
    const supabase = createSupabaseMock([
      { count: 0 },  // dupClass: none
      { count: 1 },  // dupCourse: found
    ]);

    const result = await checkEligibility(supabase, studentId, classId, courseId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Already enrolled in another class for this course');
  });

  it('rejects if course not found', async () => {
    const supabase = createSupabaseMock([
      { count: 0 },       // dupClass
      { count: 0 },       // dupCourse
      { data: null },      // course: not found
    ]);

    const result = await checkEligibility(supabase, studentId, classId, courseId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Course not found');
  });

  it('rejects if course has already started', async () => {
    const supabase = createSupabaseMock([
      { count: 0 },
      { count: 0 },
      { data: { ...validCourse, start_date: '2020-01-01' } },
    ]);

    const result = await checkEligibility(supabase, studentId, classId, courseId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('already started');
  });

  it('rejects if re-enrollment limit reached', async () => {
    const supabase = createSupabaseMock([
      { count: 0 },
      { count: 0 },
      { data: validCourse },
      { count: 3 },  // reenrollCount = max_reenroll
    ]);

    const result = await checkEligibility(supabase, studentId, classId, courseId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Re-enrollment limit reached');
  });

  it('rejects if class not found', async () => {
    const supabase = createSupabaseMock([
      { count: 0 },
      { count: 0 },
      { data: validCourse },
      { count: 0 },
      { data: null },  // class not found
    ]);

    const result = await checkEligibility(supabase, studentId, classId, courseId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Class not found');
  });

  it('rejects if class does not belong to course', async () => {
    const supabase = createSupabaseMock([
      { count: 0 },
      { count: 0 },
      { data: validCourse },
      { count: 0 },
      { data: { ...validClass, course_id: 'different-course' } },
    ]);

    const result = await checkEligibility(supabase, studentId, classId, courseId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Class does not belong');
  });

  it('rejects if time conflict exists', async () => {
    const supabase = createSupabaseMock([
      { count: 0 },
      { count: 0 },
      { data: validCourse },
      { count: 0 },
      { data: validClass },
      { data: [{ class_id: 'other', classes: { meeting_day: 'Monday', meeting_time: '10:00' } }] },
    ]);

    const result = await checkEligibility(supabase, studentId, classId, courseId);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Time conflict');
  });

  it('allows eligible enrollment', async () => {
    const supabase = createSupabaseMock([
      { count: 0 },
      { count: 0 },
      { data: validCourse },
      { count: 0 },
      { data: validClass },
      { data: [] },  // no conflicts
    ]);

    const result = await checkEligibility(supabase, studentId, classId, courseId);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});
