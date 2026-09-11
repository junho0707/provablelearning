import { POLICY_COPY, SESSION_MINUTES, NO_SHOW_AFTER_MINUTES } from "@/lib/policy";
import { PRICING, formatPrice } from "@/lib/pricing";

export const metadata = { title: "Terms of Service" };

/**
 * `AT-OPS-3`. Every number here is imported rather than typed, so a policy change cannot leave the
 * binding text asserting the old one — the drift that matters most on a page like this.
 *
 * Rewritten for the ADR-007 model. The previous version described free public content, one First
 * Session per customer, a 24-hour window, and learner profiles with no credentials of their own —
 * all four are now the opposite of the truth.
 */
export default function TermsPage() {
  return (
    <main style={{ background: "#faf9f7" }} className="text-navy-800">
      <div className="mx-auto max-w-2xl px-6 py-24 text-[0.9375rem] leading-relaxed sm:px-10 sm:py-28">
      <h1 className="text-[clamp(1.875rem,3.5vw,2.75rem)] font-semibold tracking-[-0.025em] text-navy-950">
          Terms of Service
        </h1>
        <p className="mt-3 text-[0.8125rem] text-navy-950/50">Last updated: September 2, 2026</p>
        <div className="mt-10 border-t border-navy-950/10" />

      <p className="mb-4">
        These Terms govern your use of Provable Learning (the &quot;Service&quot;), operated by
        Provable Learning LLC (&quot;we,&quot; &quot;us&quot;). By using the Service you agree to
        these Terms.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">What the Service is</h2>
      <p className="mb-4">
        One-to-one online math tutoring: {SESSION_MINUTES}-minute sessions with a tutor, preparation
        beforehand, and written materials afterwards. You buy a First Session for a student at{" "}
        {formatPrice(PRICING.first_session.priceCents)}, and afterwards buy credits and book with
        them.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Accounts</h2>
      <p className="mb-4">
        The account holder (&quot;you&quot;) signs in with Google or an email magic link — there are
        no passwords on your account. You add a student for each person you are arranging tutoring
        for.
      </p>
      <p className="mb-4">
        Students get their own sign-in, with a username and password that you set and can change at
        any time. A student&apos;s sign-in reaches only their own sessions, preparation, and
        materials. It can never reach billing, credits, booking, or messages — those are yours
        alone, and that boundary is enforced by our systems, not only by what each screen shows.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Purchases and credits</h2>
      <p className="mb-4">
        The First Session is a one-time purchase <strong>per student</strong> — each student you add
        may have one. Bundles are one-time purchases;{" "}
        {POLICY_COPY.creditsNeverExpire.toLowerCase()} and are spent one per booked session. All
        payments are processed by Stripe; we do not see or store your card details.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Booking, cancellation, and no-shows</h2>
      <p className="mb-4">
        Sessions may be booked up to {POLICY_COPY.horizon} ahead, and no later than{" "}
        {POLICY_COPY.minNotice} before they start. {POLICY_COPY.release}
      </p>
      <p className="mb-4">
        {POLICY_COPY.freeCancel} {POLICY_COPY.lateCancel} Arriving more than{" "}
        {NO_SHOW_AFTER_MINUTES} minutes late counts as a missed session and draws on the same
        allowance. We review each request and decide case by case; approval is not automatic.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">What we owe you around a session</h2>
      <p className="mb-4">
        {POLICY_COPY.materials} A session goes ahead whether or not the student completed their
        preparation — nothing about the preparation is a condition of receiving the session you paid
        for.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Refunds</h2>
      <p className="mb-4">
        See our <a href="/refund-policy" className="underline">Refund Policy</a>. There is no
        self-serve refund flow; refunds are handled case by case.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Children</h2>
      <p className="mb-4">
        Only an adult may hold an account. By adding a student and paying, you confirm you are that
        student&apos;s parent or legal guardian, or are otherwise authorised to consent on their
        behalf, and you consent to our collecting the information described in our{" "}
        <a href="/privacy" className="underline">Privacy Policy</a> from that student. You can
        withdraw that consent, or delete a student and everything they have submitted, at any time
        from your account.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Governing law</h2>
      <p className="mb-4">These Terms are governed by the laws of the State of Georgia, United States.</p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Contact</h2>
      <p>Questions about these Terms: admin@provablelearning.com.</p>
      </div>
    </main>
  );
}
