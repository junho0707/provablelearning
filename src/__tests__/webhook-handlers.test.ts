import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Webhook Handler Tests
 *
 * Tests verify:
 * - checkout.session.completed: activates enrollment with triple-match
 * - checkout.session.expired: reverses credits + deletes enrollment + notifies waitlist
 * - payment_failed: logs to admin_logs
 * - reconciliation: catches expired pending + paid pending that webhook missed
 */

// We test the webhook handler logic by verifying the source code patterns
// since the handlers depend on createAdminClient() which needs env vars.

describe('Webhook Handlers — Source Analysis', () => {
  let source: string;

  beforeEach(async () => {
    const { readFileSync } = await import('fs');
    source = readFileSync(
      new URL('../../src/lib/stripe/webhook-handlers.ts', import.meta.url).pathname,
      'utf-8'
    );
  });

  describe('handleCheckoutCompleted', () => {
    it('uses triple-match for idempotent activation', () => {
      const funcBody = extractFunction(source, 'handleCheckoutCompleted');

      // Must match on enrollment_id + stripe_session_id + pending status
      expect(funcBody).toContain("eq('id', enrollmentId)");
      expect(funcBody).toContain("eq('stripe_session_id', session.id)");
      expect(funcBody).toContain("eq('status', 'pending')");
    });

    it('sets status to active', () => {
      const funcBody = extractFunction(source, 'handleCheckoutCompleted');
      expect(funcBody).toContain("status: 'active'");
    });

    it('handles missing enrollment_id in metadata', () => {
      const funcBody = extractFunction(source, 'handleCheckoutCompleted');
      expect(funcBody).toContain('if (!enrollmentId)');
    });
  });

  describe('handleCheckoutExpired', () => {
    it('checks for credits_applied before reversing', () => {
      const funcBody = extractFunction(source, 'handleCheckoutExpired');
      expect(funcBody).toContain('credits_applied');
      expect(funcBody).toContain('credits_group_size_type');

      // Must check credits_applied > 0 before calling reverse
      expect(funcBody).toContain('enrollment.credits_applied > 0');
    });

    it('calls reverse_credits RPC when credits were applied', () => {
      const funcBody = extractFunction(source, 'handleCheckoutExpired');
      expect(funcBody).toContain("rpc('reverse_credits'");
    });

    it('deletes pending enrollment to free the seat', () => {
      const funcBody = extractFunction(source, 'handleCheckoutExpired');
      expect(funcBody).toContain('.delete()');
      expect(funcBody).toContain("eq('status', 'pending')");
    });

    it('auto-enrolls next waitlisted student', () => {
      const funcBody = extractFunction(source, 'handleCheckoutExpired');
      expect(funcBody).toContain('autoEnrollFromWaitlist');
    });

    it('logs credit reversal failure for manual reconciliation', () => {
      const funcBody = extractFunction(source, 'handleCheckoutExpired');
      expect(funcBody).toContain('credit_reversal_failed');
    });
  });

  describe('handlePaymentFailed', () => {
    it('logs payment failure to admin_logs', () => {
      const funcBody = extractFunction(source, 'handlePaymentFailed');
      expect(funcBody).toContain("'payment_failed'");
      expect(funcBody).toContain('admin_logs');
    });
  });

  describe('reconcileStripePayments', () => {
    it('checks active enrollments against Stripe', () => {
      const funcBody = extractFunction(source, 'reconcileStripePayments');
      expect(funcBody).toContain("eq('status', 'active')");
      expect(funcBody).toContain('payment_status');
    });

    it('checks pending enrollments with expired Stripe sessions (Bug #6 fix)', () => {
      const funcBody = extractFunction(source, 'reconcileStripePayments');

      // Must query pending enrollments WITH stripe_session_id
      expect(funcBody).toContain("eq('status', 'pending')");
      expect(funcBody).toContain("not('stripe_session_id', 'is', null)");

      // Must check session.status === 'expired'
      expect(funcBody).toContain("session.status === 'expired'");
    });

    it('activates paid-but-pending enrollments (missed webhook recovery)', () => {
      const funcBody = extractFunction(source, 'reconcileStripePayments');
      expect(funcBody).toContain("session.payment_status === 'paid'");
      expect(funcBody).toContain('reconciliation_paid_pending_activated');
    });

    it('reverses credits on expired pending enrollments', () => {
      const funcBody = extractFunction(source, 'reconcileStripePayments');

      // Within the expired pending handling, must check and reverse credits
      const expiredSection = funcBody.slice(funcBody.indexOf("session.status === 'expired'"));
      expect(expiredSection).toContain('credits_applied');
      expect(expiredSection).toContain('reverse_credits');
    });

    it('auto-enrolls from waitlist after cleaning up expired pending', () => {
      const funcBody = extractFunction(source, 'reconcileStripePayments');
      expect(funcBody).toContain('autoEnrollFromWaitlist');
    });

    it('detects orphaned pending enrollments without stripe_session_id', () => {
      const funcBody = extractFunction(source, 'reconcileStripePayments');
      expect(funcBody).toContain("is('stripe_session_id', null)");
      expect(funcBody).toContain('reconciliation_orphaned_pending');
    });
  });
});

describe('Webhook Route — Event Dispatch', () => {
  let source: string;

  beforeEach(async () => {
    const { readFileSync } = await import('fs');
    source = readFileSync(
      new URL('../../src/app/api/webhooks/stripe/route.ts', import.meta.url).pathname
        .replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );
  });

  it('verifies Stripe signature before processing', () => {
    const postFunc = source;
    expect(postFunc).toContain('stripe-signature');
    expect(postFunc).toContain('constructEvent');
  });

  it('handles checkout.session.completed events', () => {
    expect(source).toContain("'checkout.session.completed'");
    expect(source).toContain('handleCheckoutCompleted');
  });

  it('handles checkout.session.expired events', () => {
    expect(source).toContain("'checkout.session.expired'");
    expect(source).toContain('handleCheckoutExpired');
  });

  it('handles payment failure events', () => {
    expect(source).toContain("'checkout.session.async_payment_failed'");
    expect(source).toContain('handlePaymentFailed');
  });

  it('returns 400 on missing signature', () => {
    expect(source).toContain("'Missing signature'");
    expect(source).toContain('400');
  });

  it('returns 400 on invalid signature', () => {
    expect(source).toContain('Webhook signature verification failed');
    expect(source).toContain('400');
  });
});

// Helper to extract a function body from source
function extractFunction(source: string, funcName: string): string {
  const funcStart = source.indexOf(`async function ${funcName}`);
  if (funcStart === -1) return '';

  let braceCount = 0;
  let started = false;
  let end = funcStart;

  for (let i = funcStart; i < source.length; i++) {
    if (source[i] === '{') {
      braceCount++;
      started = true;
    } else if (source[i] === '}') {
      braceCount--;
      if (started && braceCount === 0) {
        end = i + 1;
        break;
      }
    }
  }

  return source.slice(funcStart, end);
}
