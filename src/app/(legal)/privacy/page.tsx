import { RETENTION_DAYS, UPLOAD_EXTENSIONS } from "@/lib/policy";

export const metadata = { title: "Privacy Policy" };

/**
 * `AT-OPS-3` and `AT-COPPA-6` — this page carries the kids-specific disclosure, and is linked from
 * every surface that collects from a student.
 *
 * Rewritten for the ADR-007 model. The previous version said reading lessons required no account
 * and that learner profiles carried no credentials; students now sign in and submit work, which is
 * exactly the collection this policy has to describe.
 */
export default function PrivacyPage() {
  return (
    <main style={{ background: "#faf9f7" }} className="text-navy-800">
      <div className="mx-auto max-w-2xl px-6 py-24 text-[0.9375rem] leading-relaxed sm:px-10 sm:py-28">
      <h1 className="text-[clamp(1.875rem,3.5vw,2.75rem)] font-semibold tracking-[-0.025em] text-navy-950">
          Privacy Policy
        </h1>
        <p className="mt-3 text-[0.8125rem] text-navy-950/50">Last updated: September 2, 2026</p>
        <div className="mt-10 border-t border-navy-950/10" />

      <p className="mb-4">
        This policy describes what Provable Learning (&quot;we,&quot; &quot;us&quot;), operated by
        Provable Learning LLC, collects and why. There are two kinds of person here — the account
        holder who pays, and the student who is taught — and we collect different things about each.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">What we collect from the account holder</h2>
      <ul className="mb-4 list-disc space-y-1 pl-5 marker:text-navy-950/30">
        <li>Your email address, from Google sign-in or the email you use for a magic link.</li>
        <li>An optional phone number, only if you give one, used solely for the tutor&apos;s manual
          session-reminder texts.</li>
        <li>What you tell us when booking: which student, what the session is for, and any detail
          you add about what to cover.</li>
        <li>Purchase history, credit balance and ledger, and booking history.</li>
        <li>Messages you send us.</li>
      </ul>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">What we collect from a student</h2>
      <ul className="mb-4 list-disc space-y-1 pl-5 marker:text-navy-950/30">
        <li>The name, grade, and math class <em>you</em> enter for them.</li>
        <li>A username and password that you set. <strong>We never collect a student&apos;s email
          address or phone number</strong> — their sign-in identity is not an email address, and no
          email of any kind is ever sent to a student. Anything that needs to travel outside the app
          goes to you.</li>
        <li>What they write before a session: the topic, their current and previous math class, and
          what they are stuck on.</li>
        <li>Files they attach ({UPLOAD_EXTENSIONS.join(", ")}) or document links they paste.</li>
        <li>Their answers to a diagnostic, and their progress through the practice questions in
          their materials.</li>
      </ul>
      <p className="mb-4">
        A student cannot see or reach billing, credits, booking, or messages — not their own account
        holder&apos;s, and not anyone else&apos;s.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Children under 13</h2>
      <p className="mb-4">
        Provable Learning is bought by adults and used by students, some of whom are under 13. We do
        not knowingly collect anything from a child except through their parent or guardian, and a
        student&apos;s sign-in stays inactive — it will not work at all — until the account holder
        has completed a purchase, which is when we record that consent.
      </p>
      <p className="mb-4">
        We do not advertise to children, do not use children&apos;s information for marketing, do not
        sell it, and do not condition a child&apos;s participation on disclosing more than we need to
        teach them.
      </p>
      <p className="mb-4">As the parent or guardian, you may at any time:</p>
      <ul className="mb-4 list-disc space-y-1 pl-5 marker:text-navy-950/30">
        <li>review everything your student has submitted;</li>
        <li>withdraw consent, which immediately deactivates their sign-in and stops any further
          collection;</li>
        <li>delete the student, which removes their record, submissions, uploaded files, diagnostic
          answers, and materials within {RETENTION_DAYS} days.</li>
      </ul>
      <p className="mb-4">
        All three are in your account settings. For anything you cannot do there, email
        admin@provablelearning.com.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Who else sees it</h2>
      <ul className="mb-4 list-disc space-y-1 pl-5 marker:text-navy-950/30">
        <li><strong>Supabase</strong> hosts our database, file storage, and sign-in.</li>
        <li><strong>Vercel</strong> hosts and serves the site.</li>
        <li><strong>Stripe</strong> processes payments; we never see or store your card details.</li>
        <li><strong>Google</strong> provides sign-in for account holders and powers the Calendar
          event and Meet link created for each booked session.</li>
        <li><strong>Resend</strong> sends account and booking email on our behalf — to account
          holders only, never to students.</li>
        <li><strong>Vercel Analytics</strong> gives us aggregate traffic statistics — no cookies, no
          cross-site tracking, no individual profile.</li>
      </ul>
      <p className="mb-4">We do not sell your data.</p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">SMS</h2>
      <p className="mb-4">
        We do not use an SMS platform. If you give a phone number, the tutor may text you a session
        reminder personally — there is no automated texting, and we never text a student.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Data retention and deletion</h2>
      <p className="mb-4">
        We keep account and booking records for as long as your account is active. Deleting a student
        or closing your account removes the associated records, including uploaded files, within{" "}
        {RETENTION_DAYS} days. To request deletion, use your account settings or contact
        admin@provablelearning.com.
      </p>

      <h2 className="mb-3 mt-10 border-t border-navy-950/10 pt-8 text-lg font-semibold tracking-[-0.01em] text-navy-950">Contact</h2>
      <p>Questions about this policy: admin@provablelearning.com.</p>
      </div>
    </main>
  );
}
