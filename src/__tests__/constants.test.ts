import { describe, it, expect } from 'vitest';
import { PRICES, GROUP_SIZE_RANGES, PENDING_ENROLLMENT_TTL_MINUTES, WAITLIST_CLAIM_WINDOW_HOURS } from '@/lib/constants';
import { getPriceForGroupSize, formatPrice } from '@/lib/stripe/prices';

describe('Constants — Business Rules', () => {
  it('prices match north star doc', () => {
    expect(PRICES.one_on_one).toBe(80000); // $800
    expect(PRICES.small).toBe(10000);      // $100
    expect(PRICES.medium).toBe(5000);      // $50
    expect(PRICES.large).toBe(2000);       // $20
  });

  it('group size ranges match north star doc', () => {
    expect(GROUP_SIZE_RANGES.one_on_one).toEqual({ min: 1, max: 1 });
    expect(GROUP_SIZE_RANGES.small).toEqual({ min: 2, max: 4 });
    expect(GROUP_SIZE_RANGES.medium).toEqual({ min: 5, max: 9 });
    expect(GROUP_SIZE_RANGES.large).toEqual({ min: 10, max: 30 });
  });

  it('pending enrollment TTL matches Stripe session expiry', () => {
    expect(PENDING_ENROLLMENT_TTL_MINUTES).toBe(30);
  });

  it('waitlist claim window is 24 hours', () => {
    expect(WAITLIST_CLAIM_WINDOW_HOURS).toBe(24);
  });
});

describe('Price Functions', () => {
  it('getPriceForGroupSize returns correct prices', () => {
    expect(getPriceForGroupSize('one_on_one')).toBe(80000);
    expect(getPriceForGroupSize('small')).toBe(10000);
    expect(getPriceForGroupSize('medium')).toBe(5000);
    expect(getPriceForGroupSize('large')).toBe(2000);
  });

  it('formatPrice formats cents to dollars', () => {
    expect(formatPrice(80000)).toBe('$800.00');
    expect(formatPrice(10000)).toBe('$100.00');
    expect(formatPrice(5000)).toBe('$50.00');
    expect(formatPrice(2000)).toBe('$20.00');
    expect(formatPrice(0)).toBe('$0.00');
    expect(formatPrice(99)).toBe('$0.99');
  });
});
