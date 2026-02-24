import type { GroupSizeType } from '@/lib/types';
import { PRICES } from '@/lib/constants';

export function getPriceForGroupSize(groupSizeType: GroupSizeType): number {
  return PRICES[groupSizeType];
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
