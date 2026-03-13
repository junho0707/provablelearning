import { describe, it, expect } from 'vitest';

/**
 * Enrollment Flow Integration Tests
 *
 * These tests verify the ORDERING and ERROR HANDLING of the enrollment action:
 *
 * Bug #1: Waitlist entry must be consumed AFTER seat reservation (not before)
 * Bug #2: Student ownership must be validated server-side
 * Verification: Credits are NOT used in enrollment (always Stripe)
 */

describe('Enrollment Flow — Operation Ordering', () => {
  it('Bug #1: waitlist consumed AFTER reservation, not before', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      new URL('../../src/app/(dashboard)/enroll/[classId]/actions.ts', import.meta.url).pathname.replace('%28', '(').replace('%29', ')').replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );

    const reserveSeatPos = source.indexOf('reserveSeat(');
    const waitlistConvertPos = source.indexOf("status: 'converted'");

    // Verify ordering: reserveSeat MUST come before waitlist conversion
    expect(reserveSeatPos).toBeGreaterThan(0);
    expect(waitlistConvertPos).toBeGreaterThan(0);
    expect(reserveSeatPos).toBeLessThan(waitlistConvertPos);
  });

  it('Bug #2: ownership validation exists before reservation', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      new URL('../../src/app/(dashboard)/enroll/[classId]/actions.ts', import.meta.url).pathname.replace('%28', '(').replace('%29', ')').replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );

    const ownershipCheckPos = source.indexOf('verifyStudentOwnership');
    const reserveSeatPos = source.indexOf('reserveSeat(');

    expect(ownershipCheckPos).toBeGreaterThan(0);

    const enrollActionPos = source.indexOf('export async function enrollAction');
    const ownershipCallInEnroll = source.indexOf('verifyStudentOwnership', enrollActionPos);
    expect(ownershipCallInEnroll).toBeGreaterThan(enrollActionPos);
    expect(ownershipCallInEnroll).toBeLessThan(reserveSeatPos);
  });

  it('Bug #2: ownership validation exists in joinWaitlistAction', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      new URL('../../src/app/(dashboard)/enroll/[classId]/actions.ts', import.meta.url).pathname.replace('%28', '(').replace('%29', ')').replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );

    const joinWaitlistPos = source.indexOf('export async function joinWaitlistAction');
    const joinWaitlistEnd = source.indexOf('export async function enrollAction');
    const joinWaitlistBody = source.slice(joinWaitlistPos, joinWaitlistEnd);

    expect(joinWaitlistBody).toContain('verifyStudentOwnership');
    const ownershipPos = joinWaitlistBody.indexOf('verifyStudentOwnership');
    const joinCallPos = joinWaitlistBody.indexOf('joinWaitlist(');
    expect(ownershipPos).toBeLessThan(joinCallPos);
  });

  it('credits are NOT used in enrollment (always Stripe)', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      new URL('../../src/app/(dashboard)/enroll/[classId]/actions.ts', import.meta.url).pathname.replace('%28', '(').replace('%29', ')').replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );

    // Credits must NOT be imported or used in enrollment
    expect(source).not.toContain('getCreditBalance');
    expect(source).not.toContain('applyCredits');
    expect(source).not.toContain('paid_with_credits');
    expect(source).not.toContain('credits_applied');

    // Stripe checkout must still exist
    expect(source).toContain('createCheckoutSession');
    expect(source).toContain('getPriceForGroupSize');
  });
});

describe('Enrollment Flow — verifyStudentOwnership', () => {
  it('allows both parent_id and user_id (independent students)', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      new URL('../../src/app/(dashboard)/enroll/[classId]/actions.ts', import.meta.url).pathname.replace('%28', '(').replace('%29', ')').replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );

    const funcBody = source.slice(
      source.indexOf('async function verifyStudentOwnership'),
      source.indexOf('export async function joinWaitlistAction')
    );

    // Parent ownership check
    expect(funcBody).toContain('data.parent_id === userId');
    // Independent student self-enrollment
    expect(funcBody).toContain('data.user_id === userId');
  });
});
