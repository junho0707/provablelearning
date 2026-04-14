import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCreditBalance } from '@/lib/credits/get-balance';
import { applyCredits } from '@/lib/credits/apply-credits';

/**
 * getCreditBalance chains: .from().select().eq().gt().or()
 * No .single() — awaits the chain directly, expects { data: [...] }
 */
function createCreditBalanceMock(data: unknown[] | null) {
  return {
    from: () => {
      function makeChain(): unknown {
        return new Proxy({}, {
          get(_target, prop: string) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) => resolve({ data });
            }
            if (prop === 'catch') return () => {};
            return (..._args: unknown[]) => makeChain();
          },
        });
      }
      return makeChain();
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function createApplyCreditsMock(rpcResult: { data: unknown; error?: { message: string } | null }) {
  return {
    rpc: () => Promise.resolve(rpcResult),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('getCreditBalance', () => {
  it('returns zero balances when no credits exist', async () => {
    const supabase = createCreditBalanceMock(null);
    const result = await getCreditBalance(supabase, 'stu-1');
    expect(result).toEqual({
      one_on_one: 0,
      small: 0,
      large: 0,
    });
  });

  it('aggregates credits by group_size_type', async () => {
    const supabase = createCreditBalanceMock([
      { group_size_type: 'small', remaining_amount: 2 },
      { group_size_type: 'small', remaining_amount: 1 },
      { group_size_type: 'large', remaining_amount: 3 },
    ]);
    const result = await getCreditBalance(supabase, 'stu-1');
    expect(result.small).toBe(3);
    expect(result.large).toBe(3);
    expect(result.one_on_one).toBe(0);
  });

  it('ignores unknown group_size_type values', async () => {
    const supabase = createCreditBalanceMock([
      { group_size_type: 'unknown_type', remaining_amount: 5 },
    ]);
    const result = await getCreditBalance(supabase, 'stu-1');
    expect(result).toEqual({
      one_on_one: 0,
      small: 0,
      large: 0,
    });
  });

  it('handles empty array', async () => {
    const supabase = createCreditBalanceMock([]);
    const result = await getCreditBalance(supabase, 'stu-1');
    expect(result).toEqual({
      one_on_one: 0,
      small: 0,
      large: 0,
    });
  });

  it('sums multiple credits of same type', async () => {
    const supabase = createCreditBalanceMock([
      { group_size_type: 'one_on_one', remaining_amount: 1 },
      { group_size_type: 'one_on_one', remaining_amount: 2 },
      { group_size_type: 'one_on_one', remaining_amount: 1 },
    ]);
    const result = await getCreditBalance(supabase, 'stu-1');
    expect(result.one_on_one).toBe(4);
  });
});

describe('applyCredits', () => {
  it('returns applied count from RPC on success', async () => {
    const supabase = createApplyCreditsMock({ data: 1 });
    const result = await applyCredits(supabase, 'stu-1', 'small');
    expect(result.applied).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it('returns 0 and error on RPC failure', async () => {
    const supabase = createApplyCreditsMock({
      data: null,
      error: { message: 'No credits available' },
    });
    const result = await applyCredits(supabase, 'stu-1', 'small');
    expect(result.applied).toBe(0);
    expect(result.error).toBe('No credits available');
  });

  it('returns 0 when no matching credits found', async () => {
    const supabase = createApplyCreditsMock({ data: 0 });
    const result = await applyCredits(supabase, 'stu-1', 'one_on_one');
    expect(result.applied).toBe(0);
  });
});

describe('findMakeupSessionsForCredit', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns error when no matching credit exists', async () => {
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => {
        let fromCallCount = 0;
        return {
          from: () => {
            const idx = fromCallCount++;
            function makeChain(): unknown {
              return new Proxy({}, {
                get(_target, prop: string) {
                  if (prop === 'then') {
                    // First from() call is credits query — return empty
                    if (idx === 0) return (resolve: (v: unknown) => void) => resolve({ data: [] });
                    return (resolve: (v: unknown) => void) => resolve({ data: [] });
                  }
                  if (prop === 'catch') return () => {};
                  if (prop === 'single' || prop === 'maybeSingle') {
                    return () => Promise.resolve({ data: null });
                  }
                  return (..._args: unknown[]) => makeChain();
                },
              });
            }
            return makeChain();
          },
        };
      },
    }));

    const { findMakeupSessionsForCredit } = await import(
      '@/lib/credits/find-sessions-for-credit'
    );
    const result = await findMakeupSessionsForCredit('stu-1', 'small');
    expect(result.error).toBe('No matching credit available');
  });
});

describe('redeemCreditForMakeup', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns error when not authenticated', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: () =>
        Promise.resolve({
          auth: {
            getUser: () =>
              Promise.resolve({ data: { user: null } }),
          },
        }),
    }));
    vi.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: () => ({}),
    }));

    const { redeemCreditForMakeup } = await import(
      '@/lib/credits/redeem-credit'
    );
    const result = await redeemCreditForMakeup('stu-1', 'ms-1', '2026-04-04');
    expect(result.error).toBe('Not authenticated');
  });

  it('returns error when student not found', async () => {
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
              single: () => Promise.resolve({ data: null, error: { message: 'Not found' } }),
            }),
          }),
        }),
      }),
    }));

    const { redeemCreditForMakeup } = await import(
      '@/lib/credits/redeem-credit'
    );
    const result = await redeemCreditForMakeup('stu-1', 'ms-1', '2026-04-04');
    expect(result.error).toBe('Student not found');
  });

  it('returns error when not authorized', async () => {
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
              single: () =>
                Promise.resolve({
                  data: { id: 'stu-1', user_id: 'u2', parent_id: 'u3' },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }));

    const { redeemCreditForMakeup } = await import(
      '@/lib/credits/redeem-credit'
    );
    const result = await redeemCreditForMakeup('stu-1', 'ms-1', '2026-04-04');
    expect(result.error).toBe('Not authorized');
  });

  it('parses "No matching credit" RPC error', async () => {
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
      createAdminClient: () => {
        let fromCallCount = 0;
        return {
          from: () => {
            const idx = fromCallCount++;
            return {
              select: () => ({
                eq: () => ({
                  single: () => {
                    if (idx === 0) {
                      // students query
                      return Promise.resolve({
                        data: { id: 'stu-1', user_id: 'u1', parent_id: null },
                        error: null,
                      });
                    }
                    // classes query
                    return Promise.resolve({
                      data: { id: 'ms-1', name: 'Test', subject: null, level: null, group_size_type: 'small', meeting_day: 'Mon', meeting_time: '10:00' },
                      error: null,
                    });
                  },
                }),
              }),
            };
          },
          rpc: () =>
            Promise.resolve({
              data: null,
              error: { message: 'No matching credit available for this class' },
            }),
        };
      },
    }));

    const { redeemCreditForMakeup } = await import(
      '@/lib/credits/redeem-credit'
    );
    const result = await redeemCreditForMakeup('stu-1', 'ms-1', '2026-04-04');
    expect(result.error).toBe('No matching credit available for this class.');
  });

  it('parses "full" RPC error', async () => {
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
      createAdminClient: () => {
        let fromCallCount = 0;
        return {
          from: () => {
            const idx = fromCallCount++;
            return {
              select: () => ({
                eq: () => ({
                  single: () => {
                    if (idx === 0) {
                      return Promise.resolve({
                        data: { id: 'stu-1', user_id: 'u1', parent_id: null },
                        error: null,
                      });
                    }
                    return Promise.resolve({
                      data: { id: 'ms-1', name: 'Test', subject: null, level: null, group_size_type: 'small', meeting_day: 'Mon', meeting_time: '10:00' },
                      error: null,
                    });
                  },
                }),
              }),
            };
          },
          rpc: () =>
            Promise.resolve({
              data: null,
              error: { message: 'This class is full' },
            }),
        };
      },
    }));

    const { redeemCreditForMakeup } = await import(
      '@/lib/credits/redeem-credit'
    );
    const result = await redeemCreditForMakeup('stu-1', 'ms-1', '2026-04-04');
    expect(result.error).toBe('This class is full. Please try another.');
  });
});

describe('Credits NOT usable for enrollment', () => {
  it('enrollAction does not import or use getCreditBalance/applyCredits', async () => {
    const fs = await import('fs');
    const actionSource = fs.readFileSync(
      'src/app/(dashboard)/enroll/[classId]/actions.ts',
      'utf-8'
    );
    expect(actionSource).not.toContain('getCreditBalance');
    expect(actionSource).not.toContain('applyCredits');
    expect(actionSource).not.toContain('paid_with_credits');
    expect(actionSource).not.toContain('credits_applied');
  });
});
