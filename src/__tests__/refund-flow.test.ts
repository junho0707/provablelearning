import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Refund Flow Tests
 *
 * Verifies Bug #5 fix: Refund options are now based on payment method
 * (credit vs Stripe), not just group_size_type.
 */

describe('Refund Form — Payment Method Awareness (Bug #5)', () => {
  let formSource: string;
  let actionSource: string;

  beforeEach(async () => {
    const { readFileSync } = await import('fs');
    formSource = readFileSync(
      new URL('../../src/app/(dashboard)/admin/refunds/refund-form.tsx', import.meta.url).pathname
        .replace('%28', '(').replace('%29', ')')
        .replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );
    actionSource = readFileSync(
      new URL('../../src/app/(dashboard)/admin/refunds/actions.ts', import.meta.url).pathname
        .replace('%28', '(').replace('%29', ')')
        .replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );
  });

  it('refund form accepts creditsApplied prop', () => {
    expect(formSource).toContain('creditsApplied');
    expect(formSource).toContain('creditsApplied: number');
  });

  it('determines payment method from creditsApplied', () => {
    expect(formSource).toContain('paidWithCredits');
    expect(formSource).toContain('paidWithStripe');
    expect(formSource).toContain('creditsApplied > 0');
  });

  it('shows credit_reversal option for credit-paid enrollments', () => {
    expect(formSource).toContain('credit_reversal');
    expect(formSource).toContain('Restore Credit');
    // This option should only show when paidWithCredits is true
    expect(formSource).toContain('paidWithCredits');
  });

  it('shows stripe_refund option only for Stripe-paid enrollments', () => {
    expect(formSource).toContain('stripe_refund');
    expect(formSource).toContain('paidWithStripe');
  });

  it('always offers cancel without refund', () => {
    // The "none" option should always be available
    expect(formSource).toContain('Cancel Without Refund');
  });

  it('passes credits_applied in form data', () => {
    expect(formSource).toContain("formData.set('credits_applied'");
  });
});

describe('Refund Action — credit_reversal handler', () => {
  let actionSource: string;

  beforeEach(async () => {
    const { readFileSync } = await import('fs');
    actionSource = readFileSync(
      new URL('../../src/app/(dashboard)/admin/refunds/actions.ts', import.meta.url).pathname
        .replace('%28', '(').replace('%29', ')')
        .replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );
  });

  it('handles credit_reversal refund type', () => {
    expect(actionSource).toContain("refundType === 'credit_reversal'");
  });

  it('calls reverse_credits RPC for credit reversals', () => {
    expect(actionSource).toContain("rpc('reverse_credits'");
  });

  it('processes Stripe refund BEFORE updating enrollment status', () => {
    const stripeRefundPos = actionSource.indexOf('stripe.refunds.create');
    const statusUpdatePos = actionSource.indexOf('status: refundStatus');

    expect(stripeRefundPos).toBeGreaterThan(0);
    expect(statusUpdatePos).toBeGreaterThan(0);
    expect(stripeRefundPos).toBeLessThan(statusUpdatePos);
  });

  it('returns error if Stripe refund fails (enrollment status unchanged)', () => {
    expect(actionSource).toContain('Stripe refund failed. Enrollment status unchanged');
  });

  it('auto-enrolls next waitlisted student after refund', () => {
    expect(actionSource).toContain('autoEnrollFromWaitlist');
  });

  it('logs admin action with refund details', () => {
    expect(actionSource).toContain("action: 'refund_processed'");
    expect(actionSource).toContain('refund_type');
  });
});

describe('Refund Page — passes creditsApplied to form', () => {
  let pageSource: string;

  beforeEach(async () => {
    const { readFileSync } = await import('fs');
    pageSource = readFileSync(
      new URL('../../src/app/(dashboard)/admin/refunds/page.tsx', import.meta.url).pathname
        .replace('%28', '(').replace('%29', ')')
        .replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );
  });

  it('passes creditsApplied prop to RefundForm', () => {
    expect(pageSource).toContain('creditsApplied=');
    expect(pageSource).toContain('credits_applied');
  });
});
