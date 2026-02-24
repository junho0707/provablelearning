import { describe, it, expect } from 'vitest';
import { reserveSeat } from '@/lib/enrollment/reserve';

function createMockSupabase(rpcResult: { data: unknown; error?: { message: string } | null }) {
  return {
    rpc: (_name: string, _params: unknown) => Promise.resolve(rpcResult),
  } as any;
}

describe('reserveSeat', () => {
  it('returns enrollmentId on success', async () => {
    const supabase = createMockSupabase({ data: 'enr-123' });
    const result = await reserveSeat(supabase, 'stu-1', 'cls-1', 'crs-1', '1.0', '2026-01-01T00:00:00Z');
    expect(result.enrollmentId).toBe('enr-123');
    expect(result.error).toBeNull();
  });

  it('returns error when RPC fails (class full)', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'Class is full (4 / 4)' },
    });
    const result = await reserveSeat(supabase, 'stu-1', 'cls-1', 'crs-1', '1.0', '2026-01-01T00:00:00Z');
    expect(result.enrollmentId).toBeNull();
    expect(result.error).toContain('Class is full');
  });

  it('returns error when agreement is missing', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'Agreement must be signed before enrollment' },
    });
    const result = await reserveSeat(supabase, 'stu-1', 'cls-1', 'crs-1', '', '');
    expect(result.enrollmentId).toBeNull();
    expect(result.error).toContain('Agreement');
  });

  it('returns error when class does not belong to course', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'Class does not belong to the specified course' },
    });
    const result = await reserveSeat(supabase, 'stu-1', 'cls-1', 'wrong-crs', '1.0', '2026-01-01T00:00:00Z');
    expect(result.enrollmentId).toBeNull();
    expect(result.error).toContain('does not belong');
  });

  it('returns error when course has already started', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'Cannot enroll: course has already started' },
    });
    const result = await reserveSeat(supabase, 'stu-1', 'cls-1', 'crs-1', '1.0', '2026-01-01T00:00:00Z');
    expect(result.enrollmentId).toBeNull();
    expect(result.error).toContain('already started');
  });

  it('returns error when re-enrollment limit reached', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'Re-enrollment limit reached (3 of 3 for this subject)' },
    });
    const result = await reserveSeat(supabase, 'stu-1', 'cls-1', 'crs-1', '1.0', '2026-01-01T00:00:00Z');
    expect(result.enrollmentId).toBeNull();
    expect(result.error).toContain('Re-enrollment limit');
  });
});
