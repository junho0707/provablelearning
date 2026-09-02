export const metadata = { title: "Refund Policy" };

/** TASK-OPS-001. See the note in `terms/page.tsx` — bracketed fields need real business facts filled in. */
export default function RefundPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16 text-sm leading-relaxed text-navy-800">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-navy-950">Refund Policy</h1>
      <p className="mb-6 text-navy-500">Last updated: [DATE]</p>

      <p className="mb-4">
        There is no automatic, self-serve refund flow. Refunds are handled case by case — email
        [CONTACT EMAIL] and we&apos;ll take a look.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Credits never expire</h2>
      <p className="mb-4">
        Credit packs don&apos;t expire, so there&apos;s rarely a reason to refund an unused
        credit — it&apos;s still good whenever you&apos;re ready to book.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Cancelling or rescheduling a session</h2>
      <p className="mb-4">
        Cancel or reschedule <strong>24 hours or more</strong> before your session and the credit
        is returned to your balance automatically — no request needed. Cancelling inside 24 hours,
        or not attending, uses the credit.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Asking for a used credit back</h2>
      <p className="mb-4">
        If you cancelled inside 24 hours, or a no-show was recorded and you think it shouldn&apos;t
        have been, you can ask us to review it from your sessions page. Tell us what happened — we
        read every request and decide case by case. If we approve it, the credit goes back to your
        balance.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Purchase refunds</h2>
      <p className="mb-4">
        If we approve a refund for a purchase, it&apos;s issued through Stripe to your original
        payment method, and any related credits are removed from your balance as part of the same
        adjustment so the two stay in sync.
      </p>
    </main>
  );
}
