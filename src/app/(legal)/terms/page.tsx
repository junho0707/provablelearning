export const metadata = { title: "Terms of Service" };

/**
 * TASK-OPS-001 (spec/14 §17: "Terms of Service, Privacy Policy, and a refund policy page, written
 * and linked"). The substantive content below reflects how the product actually works today; the
 * bracketed fields are business facts (legal entity name, address, governing jurisdiction) this
 * codebase has no source of truth for and must not guess — fill them in before this page is
 * treated as binding, then remove this comment.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16 text-sm leading-relaxed text-navy-800">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-navy-950">Terms of Service</h1>
      <p className="mb-6 text-navy-500">Last updated: [DATE]</p>

      <p className="mb-4">
        These Terms govern your use of Provable Learning (the &quot;Service&quot;), operated by
        [LEGAL ENTITY NAME] (&quot;we,&quot; &quot;us&quot;). By using the Service you agree to
        these Terms.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">What the Service is</h2>
      <p className="mb-4">
        Every lesson on Provable Learning is free and requires no account. An account is only
        needed to save your progress across visits, purchase a First Session or credit pack, and
        book 1:1 tutoring sessions.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Accounts</h2>
      <p className="mb-4">
        Sign-in is by Google OAuth or email magic link — there are no passwords. One account per
        buyer; you may add learner profiles beneath your account for anyone you&apos;re managing
        instruction for. Learner profiles carry no separate login credentials.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Purchases and credits</h2>
      <p className="mb-4">
        The First Session is a one-time, one-per-customer purchase. Credit packs are one-time
        purchases; credits never expire and are spent one per booked 60-minute session. All
        payments are processed by Stripe; we do not store your card details.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Booking, cancellation, and no-shows</h2>
      <p className="mb-4">
        Sessions require at least 24 hours&apos; notice to book, cancel, or reschedule without
        losing the credit. Cancelling or rescheduling 24 hours or more before a session is free;
        cancelling later, or not attending, uses the credit. If you believe a no-show was recorded
        in error, you may request a credit return, reviewed case by case.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Refunds</h2>
      <p className="mb-4">
        See our <a href="/refund-policy" className="underline">Refund Policy</a>. There is no
        self-serve refund flow; refunds are handled case by case.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Minors</h2>
      <p className="mb-4">
        Learner profiles have no login credentials of their own — a buyer&apos;s account is the
        only account involved, regardless of who the learner is.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Governing law</h2>
      <p className="mb-4">These Terms are governed by the laws of [JURISDICTION].</p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Contact</h2>
      <p>Questions about these Terms: [CONTACT EMAIL].</p>
    </main>
  );
}
