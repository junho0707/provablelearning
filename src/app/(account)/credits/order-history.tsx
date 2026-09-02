import { formatPrice } from "@/lib/pricing";
import type { LedgerEntry, Purchase } from "@/lib/credits/types";

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

export function OrderHistory({ purchases, ledger }: { purchases: Purchase[]; ledger: LedgerEntry[] }) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-navy-400">
          Purchases
        </h3>
        {purchases.length === 0 ? (
          <p className="text-sm text-navy-500">No purchases yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {purchases.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-navy-100 pb-2 last:border-0">
                <span>{SKU_LABEL[p.sku]}</span>
                <span className="text-navy-500">{formatPrice(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-navy-400">
          Credit activity
        </h3>
        {ledger.length === 0 ? (
          <p className="text-sm text-navy-500">No activity yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {ledger.map((entry) => (
              <li key={entry.id} className="flex justify-between border-b border-navy-100 pb-2 last:border-0">
                <span>{REASON_LABEL[entry.reason]}</span>
                <span className={entry.delta > 0 ? "text-emerald-600" : "text-navy-500"}>
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
