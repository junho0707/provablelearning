import { describe, it, expect } from 'vitest';
import { PRICES, GROUP_SIZE_RANGES, SESSION_DURATION_HOURS, PENDING_ENROLLMENT_TTL_MINUTES, WAITLIST_CLAIM_WINDOW_HOURS, getPriceForEnrollment } from '@/lib/constants';
import { getPriceForGroupSize, formatPrice } from '@/lib/stripe/prices';

describe('Constants — Business Rules', () => {
  it('prices match rolling enrollment model', () => {
    expect(PRICES.large).toBe(2000);            // $20/mo
    expect(PRICES.small).toBe(30000);           // $300/mo
    expect(PRICES.one_on_one).toBe(80000);      // $800/mo (2x/wk, 1.5hr)
  });

  it('group size ranges match current model', () => {
    expect(GROUP_SIZE_RANGES.one_on_one).toEqual({ min: 1, max: 1 });
    expect(GROUP_SIZE_RANGES.small).toEqual({ min: 1, max: 3 });
    expect(GROUP_SIZE_RANGES.large).toEqual({ min: 10, max: 20 });
  });

  it('session durations are correct', () => {
    expect(SESSION_DURATION_HOURS.one_on_one).toBe(1.5);
    expect(SESSION_DURATION_HOURS.small).toBe(1.5);
    expect(SESSION_DURATION_HOURS.large).toBe(1.5);
  });

  it('pending enrollment TTL matches Stripe session expiry', () => {
    expect(PENDING_ENROLLMENT_TTL_MINUTES).toBe(30);
  });

  it('waitlist claim window is 24 hours', () => {
    expect(WAITLIST_CLAIM_WINDOW_HOURS).toBe(24);
  });
});

describe('getPriceForEnrollment', () => {
  it('returns correct prices by group size', () => {
    expect(getPriceForEnrollment('large')).toBe(2000);
    expect(getPriceForEnrollment('small')).toBe(30000);
    expect(getPriceForEnrollment('one_on_one')).toBe(80000);
  });
});

describe('Price Functions', () => {
  it('getPriceForGroupSize returns correct prices', () => {
    expect(getPriceForGroupSize('one_on_one')).toBe(80000);
    expect(getPriceForGroupSize('small')).toBe(30000);
    expect(getPriceForGroupSize('large')).toBe(2000);
  });

  it('formatPrice formats cents to dollars', () => {
    expect(formatPrice(80000)).toBe('$800.00');
    expect(formatPrice(30000)).toBe('$300.00');
    expect(formatPrice(2000)).toBe('$20.00');
    expect(formatPrice(0)).toBe('$0.00');
    expect(formatPrice(99)).toBe('$0.99');
  });
});
