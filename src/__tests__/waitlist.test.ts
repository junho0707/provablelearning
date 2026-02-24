import { describe, it, expect, vi, beforeEach } from 'vitest';
import { joinWaitlist } from '@/lib/waitlist/join';

function createMockSupabase(config: {
  existingEntry?: { id: string } | null;
  insertResult?: { data: { id: string } | null; error?: { message: string } | null };
}) {
  let fromCallCount = 0;

  return {
    from: (_table: string) => {
      const currentCall = fromCallCount++;

      const chain: unknown = new Proxy({}, {
        get(_target, prop: string) {
          if (prop === 'then' || prop === 'catch') return undefined;

          if (prop === 'single' || prop === 'maybeSingle') {
            if (currentCall === 0) {
              // First call: check existing
              return () => Promise.resolve({ data: config.existingEntry ?? null });
            } else {
              // Second call: insert result
              return () => Promise.resolve(config.insertResult ?? { data: { id: 'wl-1' }, error: null });
            }
          }

          return (..._args: unknown[]) => chain;
        },
      });

      return chain;
    },
  } as any;
}

describe('joinWaitlist', () => {
  it('rejects if already on waitlist', async () => {
    const supabase = createMockSupabase({
      existingEntry: { id: 'existing-wl' },
    });

    const result = await joinWaitlist(supabase, 'stu-1', 'coh-1', 'v1', '2026-01-01T00:00:00Z');
    expect(result.waitlistId).toBeNull();
    expect(result.error).toContain('Already on waitlist');
  });

  it('successfully joins waitlist when not already on it', async () => {
    const supabase = createMockSupabase({
      existingEntry: null,
      insertResult: { data: { id: 'new-wl-1' }, error: null },
    });

    const result = await joinWaitlist(supabase, 'stu-1', 'coh-1', 'v1', '2026-01-01T00:00:00Z');
    expect(result.waitlistId).toBe('new-wl-1');
    expect(result.error).toBeNull();
  });

  it('returns error on insert failure', async () => {
    const supabase = createMockSupabase({
      existingEntry: null,
      insertResult: { data: null, error: { message: 'DB constraint violation' } },
    });

    const result = await joinWaitlist(supabase, 'stu-1', 'coh-1', 'v1', '2026-01-01T00:00:00Z');
    expect(result.waitlistId).toBeNull();
    expect(result.error).toBe('DB constraint violation');
  });
});
