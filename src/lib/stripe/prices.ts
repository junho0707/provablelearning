import { getPriceForEnrollment } from '@/lib/constants';

export function getPriceForGroupSize(groupSizeType: string): number {
  return getPriceForEnrollment(groupSizeType);
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
