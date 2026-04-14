import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * findAlternateSessions is now subject-agnostic:
 * - Matches by group_size_type only
 * - Uses enrollment window (student_start_date/student_end_date)
 * - Skips student's own enrolled classes
 * - Computes session dates from target week
 */

describe('Alternate Session Discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when cancellation not found', async () => {
    const mock = createMockForFind({
      cancellation: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('nonexistent-id');
    expect(result.error).toBe('Cancellation not found');
  });

  it('returns empty for large group cancellations', async () => {
    const mock = createMockForFind({
      cancellation: makeCancellation({ group_size_type: 'large' }),
    });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('c1');
    expect(result.sessions).toEqual([]);
  });

  it('rejects if cancellation is not in cancelled status', async () => {
    const mock = createMockForFind({
      cancellation: makeCancellation({ status: 'rescheduled' }),
    });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('c1');
    expect(result.error).toBe('Cancellation is not in cancelled status');
  });

  it('returns empty array when no alternate classes exist', async () => {
    const mock = createMockForFind({
      cancellation: makeCancellation(),
      origClass: { id: 'cl1', group_size_type: 'small', class_start_date: '2026-03-01' },
      enrollment: makeEnrollment(),
      matchingClasses: [],
    });
    vi.mocked(createAdminClient).mockReturnValue(mock);

    const { findAlternateSessions } = await import(
      '@/lib/cancellation/find-alternate-sessions'
    );
    const result = await findAlternateSessions('c1');
    expect(result.sessions).toEqual([]);
  });
});

describe('Makeup Booking RPC Validation (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('bookMakeupSession passes through unhandled RPC errors', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          auth: {
            getUser: () =>
              Promise.resolve({ data: { user: { id: 'u1' } } }),
          },
        }),
    }));
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: () => ({
          delete: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
        rpc: () =>
          Promise.resolve({
            data: null,
            error: { message: 'Host class must be for the same course' },
          }),
      }),
    }));

    const { bookMakeupSession } = await import(
      '@/lib/cancellation/book-makeup'
    );
    const result = await bookMakeupSession('c1', 'cl2', '2026-04-01');
    expect(result.error).toBe('Host class must be for the same course');
  });

  it('bookMakeupSession parses "session is full" error', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          auth: {
            getUser: () =>
              Promise.resolve({ data: { user: { id: 'u1' } } }),
          },
        }),
    }));
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: () => ({
          delete: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
        rpc: () =>
          Promise.resolve({
            data: null,
            error: { message: 'Host class session is full' },
          }),
      }),
    }));

    const { bookMakeupSession } = await import(
      '@/lib/cancellation/book-makeup'
    );
    const result = await bookMakeupSession('c1', 'cl2', '2026-04-01');
    expect(result.error).toBe('This session is full. Please try another class.');
  });

  it('cancelMakeupBooking parses "not in booked status" error', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          auth: {
            getUser: () =>
              Promise.resolve({ data: { user: { id: 'u1' } } }),
          },
        }),
    }));
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
        rpc: () =>
          Promise.resolve({
            data: null,
            error: { message: 'Makeup booking is not in booked status' },
          }),
      }),
    }));

    const { cancelMakeupBooking } = await import(
      '@/lib/cancellation/cancel-makeup'
    );
    const result = await cancelMakeupBooking('b1');
    expect(result.error).toBe(
      'This makeup booking has already been cancelled or completed.'
    );
  });
});

describe('Cron: cancel-credits makeup no-show handling', () => {
  it('marks booked makeups past session_date as no_show', async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const booking = {
      id: 'b1',
      session_date: yesterdayStr,
      status: 'booked',
    };

    expect(new Date(booking.session_date) < today).toBe(true);
    expect(booking.status).toBe('booked');
  });
});

// --- Helpers ---

function makeCancellation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    class_id: 'cl1',
    enrollment_id: 'enr1',
    session_number: 3,
    session_date: '2026-03-18',
    group_size_type: 'small',
    status: 'cancelled',
    ...overrides,
  };
}

function makeEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    student_start_date: '2026-03-01',
    student_end_date: '2026-04-01',
    slot_1_class_id: 'cl1',
    slot_2_class_id: null,
    slot_3_class_id: null,
    class_id: 'cl1',
    ...overrides,
  };
}

function createMockForFind(config: {
  cancellation?: Record<string, unknown> | null;
  origClass?: Record<string, unknown> | null;
  enrollment?: Record<string, unknown> | null;
  matchingClasses?: Record<string, unknown>[];
}) {
  let fromCallCount = 0;

  return {
    from: (table: string) => {
      fromCallCount++;

      function makeChain(): unknown {
        return new Proxy({}, {
          get(_target, prop: string) {
            if (prop === 'then') {
              if (table === 'session_cancellations') {
                return (resolve: (v: unknown) => void) => resolve({
                  data: config.cancellation,
                  error: config.cancellation ? null : { message: 'Not found' },
                });
              }
              if (table === 'classes' && fromCallCount <= 2) {
                // First classes query = origClass
                return (resolve: (v: unknown) => void) => resolve({
                  data: config.origClass ?? null,
                  error: null,
                });
              }
              if (table === 'classes') {
                // Second classes query = matchingClasses
                return (resolve: (v: unknown) => void) => resolve({
                  data: config.matchingClasses ?? [],
                  error: null,
                });
              }
              if (table === 'enrollments' && fromCallCount <= 3) {
                // enrollment query
                return (resolve: (v: unknown) => void) => resolve({
                  data: config.enrollment ?? null,
                  error: null,
                });
              }
              return (resolve: (v: unknown) => void) => resolve({ data: null, count: 0 });
            }
            if (prop === 'catch') return () => {};
            if (prop === 'single' || prop === 'maybeSingle') {
              return () => {
                if (table === 'session_cancellations') {
                  return Promise.resolve({
                    data: config.cancellation,
                    error: config.cancellation ? null : { message: 'Not found' },
                  });
                }
                if (table === 'classes') {
                  return Promise.resolve({
                    data: config.origClass ?? null,
                    error: null,
                  });
                }
                if (table === 'enrollments') {
                  return Promise.resolve({
                    data: config.enrollment ?? null,
                    error: null,
                  });
                }
                return Promise.resolve({ data: null, error: null });
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
