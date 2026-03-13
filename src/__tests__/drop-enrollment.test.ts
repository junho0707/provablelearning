import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Drop Enrollment Integration Tests
 *
 * Tests the dropEnrollment() TS function with mocked Supabase.
 * Validates error handling, RPC error mapping, and slot-based waitlist dispatch.
 */

beforeEach(() => {
  vi.resetModules();
});

function setupMocks(opts: {
  user?: { id: string } | null;
  enrollment?: Record<string, unknown> | null;
  rpcResult?: { data?: unknown; error?: { message: string } | null };
}) {
  vi.doMock('@/lib/supabase/server', () => ({
    createClient: () =>
      Promise.resolve({
        auth: {
          getUser: () => Promise.resolve({ data: { user: opts.user ?? null } }),
        },
      }),
  }));

  let rpcCalled = false;
  const mockAdmin = {
    from: (table: string) => {
      if (table === 'enrollments') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: opts.enrollment ?? null }),
            }),
          }),
        };
      }
      // admin_logs — best-effort insert
      return {
        insert: () => Promise.resolve({ error: null }),
      };
    },
    rpc: (_name: string, _params: unknown) => {
      rpcCalled = true;
      return Promise.resolve(opts.rpcResult ?? { error: null });
    },
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve({ data: { user: null } }),
      },
    },
  };

  vi.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: () => mockAdmin,
  }));

  vi.doMock('@/lib/waitlist/auto-enroll', () => ({
    dispatchWaitlistAutoEnroll: vi.fn().mockResolvedValue(undefined),
  }));

  vi.doMock('@/lib/google/classroom', () => ({
    removeStudentFromClassroom: vi.fn().mockResolvedValue(undefined),
  }));

  return { getRpcCalled: () => rpcCalled };
}

describe('dropEnrollment', () => {
  it('returns error when user is not authenticated', async () => {
    setupMocks({ user: null });
    const { dropEnrollment } = await import('@/lib/enrollment/drop');
    const result = await dropEnrollment('enr-1', 'test');
    expect(result.error).toBe('Not authenticated');
  });

  it('returns error when enrollment not found', async () => {
    setupMocks({ user: { id: 'u1' }, enrollment: null });
    const { dropEnrollment } = await import('@/lib/enrollment/drop');
    const result = await dropEnrollment('enr-1', 'test');
    expect(result.error).toBe('Enrollment not found');
  });

  it('maps "not active" RPC error to user-friendly message', async () => {
    setupMocks({
      user: { id: 'u1' },
      enrollment: { class_id: 'cls-1', student_id: 'stu-1', slot_1_class_id: 'cls-1', slot_2_class_id: null },
      rpcResult: { error: { message: 'Enrollment is not active' } },
    });
    const { dropEnrollment } = await import('@/lib/enrollment/drop');
    const result = await dropEnrollment('enr-1', 'test');
    expect(result.error).toContain('not currently active');
  });

  it('maps "Not authorized" RPC error', async () => {
    setupMocks({
      user: { id: 'u1' },
      enrollment: { class_id: 'cls-1', student_id: 'stu-1', slot_1_class_id: 'cls-1', slot_2_class_id: null },
      rpcResult: { error: { message: 'Not authorized to drop this enrollment' } },
    });
    const { dropEnrollment } = await import('@/lib/enrollment/drop');
    const result = await dropEnrollment('enr-1', 'test');
    expect(result.error).toContain('not authorized');
  });

  it('maps "Cannot self-drop" RPC error verbatim', async () => {
    setupMocks({
      user: { id: 'u1' },
      enrollment: { class_id: 'cls-1', student_id: 'stu-1', slot_1_class_id: 'cls-1', slot_2_class_id: null },
      rpcResult: { error: { message: 'Cannot self-drop a paid enrollment. Please schedule a refund consultation.' } },
    });
    const { dropEnrollment } = await import('@/lib/enrollment/drop');
    const result = await dropEnrollment('enr-1', 'test');
    expect(result.error).toContain('Cannot self-drop');
  });

  it('returns success on successful drop', async () => {
    setupMocks({
      user: { id: 'u1' },
      enrollment: {
        class_id: 'cls-1',
        student_id: 'stu-1',
        slot_1_class_id: 'cls-1',
        slot_2_class_id: 'cls-2',
      },
      rpcResult: { error: null },
    });
    const { dropEnrollment } = await import('@/lib/enrollment/drop');
    const result = await dropEnrollment('enr-1', 'test');
    expect(result.success).toBe(true);
    expect(result.classId).toBe('cls-1');
  });

  it('dispatches waitlist auto-enroll for both slots', async () => {
    setupMocks({
      user: { id: 'u1' },
      enrollment: {
        class_id: 'cls-1',
        student_id: 'stu-1',
        slot_1_class_id: 'cls-1',
        slot_2_class_id: 'cls-2',
      },
      rpcResult: { error: null },
    });
    const { dropEnrollment } = await import('@/lib/enrollment/drop');
    await dropEnrollment('enr-1', 'test');

    const { dispatchWaitlistAutoEnroll } = await import('@/lib/waitlist/auto-enroll');
    expect(dispatchWaitlistAutoEnroll).toHaveBeenCalledTimes(2);
    expect(dispatchWaitlistAutoEnroll).toHaveBeenCalledWith('cls-1');
    expect(dispatchWaitlistAutoEnroll).toHaveBeenCalledWith('cls-2');
  });
});
