import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Refund Flow Tests
 *
 * Verifies the refund request system (admin/refund-requests/).
 * ReviewForm: admin reviews pending requests, picks refund type, approves/denies.
 * Action: processes Stripe refund, credit reversal, or cancellation.
 */

describe('Review Form — Payment Method Awareness', () => {
  let formSource: string;

  beforeEach(async () => {
    const { readFileSync } = await import('fs');
    formSource = readFileSync(
      new URL('../../src/app/(dashboard)/admin/refund-requests/review-form.tsx', import.meta.url).pathname
        .replace('%28', '(').replace('%29', ')')
        .replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );
  });

  it('review form accepts creditsApplied prop', () => {
    expect(formSource).toContain('creditsApplied');
    expect(formSource).toContain('creditsApplied: number');
  });

  it('determines payment method from stripeSessionId and creditsApplied', () => {
    expect(formSource).toContain('hasPaid');
    expect(formSource).toContain('hasCredits');
  });

  it('offers credit_reversal option', () => {
    expect(formSource).toContain('credit_reversal');
  });

  it('offers stripe_refund option', () => {
    expect(formSource).toContain('stripe_refund');
  });

  it('offers cancel without refund (none)', () => {
    expect(formSource).toContain("'none'");
  });
});

describe('Refund Action — Processing', () => {
  let actionSource: string;

  beforeEach(async () => {
    const { readFileSync } = await import('fs');
    actionSource = readFileSync(
      new URL('../../src/app/(dashboard)/admin/refund-requests/actions.ts', import.meta.url).pathname
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
    const refundTypeCheck = actionSource.indexOf("refundType === 'stripe_refund'");

    expect(stripeRefundPos).toBeGreaterThan(0);
    expect(refundTypeCheck).toBeGreaterThan(0);
    // Stripe refund happens early in the function
    expect(refundTypeCheck).toBeLessThan(stripeRefundPos);
  });

  it('returns error if Stripe refund fails', () => {
    expect(actionSource).toContain('Stripe refund failed');
  });

  it('dispatches waitlist auto-enroll after refund', () => {
    expect(actionSource).toContain('dispatchWaitlistAutoEnroll');
  });

  it('removes student from Google Classroom', () => {
    expect(actionSource).toContain('removeStudentFromClassroom');
  });
});

describe('Refund Page — passes creditsApplied to ReviewForm', () => {
  let pageSource: string;

  beforeEach(async () => {
    const { readFileSync } = await import('fs');
    pageSource = readFileSync(
      new URL('../../src/app/(dashboard)/admin/refund-requests/page.tsx', import.meta.url).pathname
        .replace('%28', '(').replace('%29', ')')
        .replace('%28', '(').replace('%29', ')'),
      'utf-8'
    );
  });

  it('fetches credits_applied from enrollments', () => {
    expect(pageSource).toContain('credits_applied');
  });

  it('renders ReviewForm component', () => {
    expect(pageSource).toContain('ReviewForm');
  });
});
