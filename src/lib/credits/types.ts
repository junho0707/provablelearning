import type { SkuId } from "@/lib/pricing";

export type Purchase = {
  id: string;
  sku: SkuId;
  amountCents: number;
  goal: "strengths" | "test_prep" | "class_help" | null;
  createdAt: string;
};

export type LedgerEntry = {
  id: string;
  delta: number;
  reason: "purchase" | "booking_spend" | "cancel_refund" | "noshow_return" | "admin_adjust";
  createdAt: string;
};
