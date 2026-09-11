import { POLICY_COPY, CREDIT_RETURNS_PER_MONTH, NO_SHOW_AFTER_MINUTES } from "@/lib/policy";

export const metadata = { title: "Refund Policy" };

/**
 * `AT-OPS-3`. Numbers are imported, not typed — this page and `02-POLICIES.md` must never disagree
 * about the window or the monthly cap. The previous version stated 24 hours and no cap at all.
 */
export default function RefundPolicyPage() {
  return (
    <main style={{ background: "#faf9f7" }} className="text-navy-800">
      <div className="mx-auto max-w-2xl px-6 py-24 text-[0.9375rem] leading-relaxed sm:px-10 sm:py-28">
      <h1 className="text-[clamp(1.875rem,3.5vw,2.75rem)] font-semibold tracking-[-0.025em] text-navy-950">
          Refund Policy
        </h1>
        <p className="mt-3 text-[0.8125rem] text-navy-950/50">Last updated: September 2, 2026</p>
        <div className="mt-10 border-t border-navy-950/10" />

      <p className="mb-4">
        There is no automatic, self-serve refund flow. Refunds are handled case by case — email
        admin@provablelearning.com and we&apos;ll take a look.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Credits never expire</h2>
      <p className="mb-4">
        Bundles don&apos;t expire, so there&apos;s rarely a reason to refund an unused
        credit — it&apos;s still good whenever you&apos;re ready to book.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Cancelling or rescheduling a session</h2>
      <p className="mb-4">
        {POLICY_COPY.freeCancel} No request is needed — it happens automatically. Cancelling inside{" "}
        {POLICY_COPY.minNotice}, or not attending, uses the credit. Arriving more than{" "}
        {NO_SHOW_AFTER_MINUTES} minutes late counts as not attending.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Asking for a used credit back</h2>
      <p className="mb-4">
        If you cancelled inside {POLICY_COPY.minNotice}, or a session was recorded as missed and you
        think it shouldn&apos;t have been, you can ask us to review it from your sessions page. Tell
        us what happened — we read every request and decide case by case. If we approve it, the
        credit goes back to your balance.
      </p>
      <p className="mb-4">
        We return up to <strong>{CREDIT_RETURNS_PER_MONTH} credits per student per calendar
        month</strong>, counting late cancellations and missed sessions together. Past that we
        can&apos;t return a credit for that month, and we&apos;ll tell you before you write the
        request rather than after.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Purchase refunds</h2>
      <p className="mb-4">
        If we approve a refund for a purchase, it&apos;s issued through Stripe to your original
        payment method, and any related credits are removed from your balance as part of the same
        adjustment so the two stay in sync.
      </p>
      </div>
    </main>
  );
}
