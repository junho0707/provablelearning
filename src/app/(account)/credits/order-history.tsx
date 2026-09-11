import { formatPrice } from "@/lib/pricing";
import type { LedgerEntry, Purchase } from "@/lib/credits/types";
import { EYEBROW } from "@/lib/ui";

const SKU_LABEL: Record<Purchase["sku"], string> = {
  first_session: "First Session",
  credits_1: "1 credit",
  credits_2: "2 credits",
  credits_4: "4 credits",
  credits_8: "8 credits",
};

const REASON_LABEL: Record<LedgerEntry["reason"], string> = {
  purchase: "Purchase",
  booking_spend: "Session booked",
  cancel_refund: "Cancellation refund",
  noshow_return: "No-show credit returned",
  admin_adjust: "Adjustment",
};

/** Two ledgers side by side, each a hairline-divided list rather than a boxed card. */
export function OrderHistory({ purchases, ledger }: { purchases: Purchase[]; ledger: LedgerEntry[] }) {
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <section>
        <h3 className={`mb-4 ${EYEBROW}`}>Purchases</h3>
        {purchases.length === 0 ? (
          <p className="text-[0.875rem] text-navy-950/45">No purchases yet.</p>
        ) : (
          <ul className="border-t border-navy-950/10 text-[0.9375rem]">
            {purchases.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-navy-950/10 py-3">
                <span className="text-navy-800">{SKU_LABEL[p.sku]}</span>
                <span className="tabular-nums text-navy-950/55">{formatPrice(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className={`mb-4 ${EYEBROW}`}>Credit activity</h3>
        {ledger.length === 0 ? (
          <p className="text-[0.875rem] text-navy-950/45">No activity yet.</p>
        ) : (
          <ul className="border-t border-navy-950/10 text-[0.9375rem]">
            {ledger.map((entry) => (
              <li key={entry.id} className="flex justify-between border-b border-navy-950/10 py-3">
                <span className="text-navy-800">{REASON_LABEL[entry.reason]}</span>
                <span
                  className={`tabular-nums ${
                    entry.delta > 0 ? "text-[var(--success)]" : "text-navy-950/55"
                  }`}
                >
                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
