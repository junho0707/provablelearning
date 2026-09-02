export const metadata = { title: "Privacy Policy" };

/** TASK-OPS-001. See the note in `terms/page.tsx` — bracketed fields need real business facts filled in. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16 text-sm leading-relaxed text-navy-800">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-navy-950">Privacy Policy</h1>
      <p className="mb-6 text-navy-500">Last updated: [DATE]</p>

      <p className="mb-4">
        This policy describes what Provable Learning (&quot;we,&quot; &quot;us&quot;), operated by
        [LEGAL ENTITY NAME], collects and why.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Reading lessons requires nothing</h2>
      <p className="mb-4">
        Every lesson and practice question is free and viewable without an account. We don&apos;t
        require sign-in to read content, and anonymous practice attempts are never recorded.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">What we collect if you create an account</h2>
      <ul className="mb-4 list-disc space-y-1 pl-5">
        <li>Your email address (from Google OAuth or the email you use for a magic link).</li>
        <li>An optional phone number, only if you provide one, used solely for the tutor&apos;s
          manual session-reminder texts.</li>
        <li>Learner profile details you enter: a name, grade, and current class. No credentials or
          contact information are collected for a learner profile itself.</li>
        <li>Your practice-question attempts and lesson-completion progress, tied to the active
          learner profile.</li>
        <li>Purchase and credit-ledger history, and booking history (session times, which learner
          profile attended).</li>
      </ul>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Who else sees it</h2>
      <ul className="mb-4 list-disc space-y-1 pl-5">
        <li><strong>Stripe</strong> processes payments; we never see or store your card details.</li>
        <li><strong>Google</strong> provides OAuth sign-in and powers the Calendar event / Meet
          link created for each booked session.</li>
        <li><strong>Resend</strong> sends account and booking emails (confirmations, reminders,
          receipts) on our behalf.</li>
        <li><strong>Vercel Analytics</strong> gives us aggregate, privacy-friendly traffic
          statistics — no cookies, no cross-site tracking, no individual profile.</li>
      </ul>
      <p className="mb-4">We do not sell your data.</p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">SMS</h2>
      <p className="mb-4">
        We do not use an SMS platform. If you provide a phone number, the tutor may text you a
        manual session reminder personally — there is no automated texting.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Data retention and deletion</h2>
      <p className="mb-4">
        We retain account and booking records for as long as your account is active. To request
        deletion of your account and associated data, contact [CONTACT EMAIL].
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy-950">Contact</h2>
      <p>Questions about this policy: [CONTACT EMAIL].</p>
    </main>
  );
}
