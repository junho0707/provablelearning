import { describe, it, expect } from 'vitest';
import { getCreditBalance } from '@/lib/credits/get-balance';
import { applyCredits } from '@/lib/credits/apply-credits';

/**
 * getCreditBalance chains: .from().select().eq().gt().or()
 * No .single() — awaits the chain directly, expects { data: [...] }
 */
function createCreditBalanceMock(data: unknown[] | null) {
  return {
    from: (_table: string) => {
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
  } as any;
}

function createApplyCreditsMock(rpcResult: { data: unknown; error?: { message: string } | null }) {
  return {
    rpc: (_name: string, _params: unknown) => Promise.resolve(rpcResult),
  } as any;
}

describe('getCreditBalance', () => {
  it('returns zero balances when no credits exist', async () => {
    const supabase = createCreditBalanceMock(null);
    const result = await getCreditBalance(supabase, 'stu-1');
    expect(result).toEqual({
      one_on_one: 0,
      small: 0,
      medium: 0,
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
    expect(result.medium).toBe(0);
  });

  it('ignores unknown group_size_type values', async () => {
    const supabase = createCreditBalanceMock([
      { group_size_type: 'unknown_type', remaining_amount: 5 },
    ]);
    const result = await getCreditBalance(supabase, 'stu-1');
    expect(result).toEqual({
      one_on_one: 0,
      small: 0,
      medium: 0,
      large: 0,
    });
  });

  it('handles empty array', async () => {
    const supabase = createCreditBalanceMock([]);
    const result = await getCreditBalance(supabase, 'stu-1');
    expect(result).toEqual({
      one_on_one: 0,
      small: 0,
      medium: 0,
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
