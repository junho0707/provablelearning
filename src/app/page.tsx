import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SignUpButton } from "@/components/auth/sign-up-button";
import { ObfuscatedEmail } from "@/components/obfuscated-email";
import { PRICING, formatPrice } from "@/lib/pricing";
import { POLICY_COPY } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import { getPurchaseHistory } from "@/lib/credits/history";

const FIRST_SESSION_PRICE = formatPrice(PRICING.first_session.priceCents);

// Copy rule: strengths and next steps, never deficits (spec/14, ADR-005).
const IS_THIS_FOR_YOU = [
  {
    title: "School year math help",
    bullets: ["Stay on top of what your class is covering", "Prepare for quizzes and tests"],
  },
  {
    title: "Math diagnostics",
    bullets: ["Figure out your strengths and weaknesses", "Also great for test prep — SAT, PSAT, ACT"],
  },
  {
    title: "Real understanding",
    bullets: [
      "Build the conceptual understanding that makes math click",
      "For good, not just for the next test",
    ],
  },
];

const CREDIT_AUDIENCES = [
  {
    title: "School year",
    body: "Stay on top of what's being taught, week to week.",
  },
  {
    title: "Test prep",
    body: "Learn at your own pace with a guide, then check in — SAT, PSAT, ACT.",
  },
  {
    title: "Math gap filler",
    body: "After your first session, work through the gaps at your own pace, with check-ins.",
  },
  {
    title: "Real understanding",
    body: "Build real conceptual understanding at your own pace, with check-ins along the way.",
  },
];

// `system/02-POLICIES.md` §2-§5. Every sentence comes from POLICY_COPY so the page cannot state a
// rule the code doesn't enforce — the numbers live in one module and the drift test guards them.
const SCHEDULING_RULES = [
  {
    title: "Booking window",
    body: `Book up to ${POLICY_COPY.horizon} ahead, with at least ${POLICY_COPY.minNotice}' notice. ${POLICY_COPY.release}`,
  },
  { title: "Cancel or reschedule", body: POLICY_COPY.freeCancel },
  { title: "Changed your mind late", body: POLICY_COPY.lateCancel },
  { title: "Credits", body: POLICY_COPY.creditsNeverExpire },
];

const CREDIT_PACKS: Array<{ sku: "credits_1" | "credits_2" | "credits_4" | "credits_8" }> = [
  { sku: "credits_1" },
  { sku: "credits_2" },
  { sku: "credits_4" },
  { sku: "credits_8" },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasFirstSession = user
    ? (await getPurchaseHistory()).some((p) => p.sku === "first_session")
    : false;

  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-950 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-navy-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--navy-700)_0%,_transparent_50%)] opacity-40" />

        <div className="relative mx-auto flex max-w-[1120px] flex-col items-center px-5 pb-6 pt-14 text-center sm:px-8 sm:pb-6 sm:pt-14">
          <h1 className="mb-14 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-5xl lg:text-[3.5rem]">
            Want to get better at math?
          </h1>
          <p className="mb-6 text-sm font-bold uppercase tracking-widest text-gold-400">
            Who it&apos;s for
          </p>
          <div className="mb-6 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
            {IS_THIS_FOR_YOU.map((item, i) => (
              <div
                key={item.title}
                className="rounded-xl border border-white/20 bg-white/10 p-5 text-left backdrop-blur-sm"
              >
                <p className="mb-1.5 flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-gold-400">{i + 1}.</span>
                  <span className="font-semibold text-white">{item.title}</span>
                </p>
                <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-navy-200">
                  {item.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center gap-4">
            <SignUpButton
              signedIn={Boolean(user)}
              hasFirstSession={hasFirstSession}
              className="rounded-lg bg-gold-500 px-10 py-4 text-base font-bold text-navy-950 shadow-[0_8px_24px_-8px_rgba(212,168,67,0.6)] hover:bg-gold-400"
            />
            {!hasFirstSession && (
              <p className="rounded-lg border border-white/15 bg-white/5 px-5 py-2 text-sm text-navy-200">
                Your first 1 hour session is <span className="font-bold text-white">{FIRST_SESSION_PRICE}</span>.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Credit sessions */}
      <section className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
        <h2 className="mb-3 text-3xl font-extrabold tracking-[-0.01em] text-navy-950 sm:text-4xl">
          After first session
        </h2>
        <p className="mb-10 text-lg text-navy-600">Keep going with 1 hour 1:1 credit sessions</p>

        <h3 className="mb-6 text-lg font-bold text-navy-950">Who it&apos;s for</h3>
        <div className="mb-12 grid grid-flow-col auto-cols-fr gap-6 overflow-x-auto">
          {CREDIT_AUDIENCES.map((c) => (
            <div
              key={c.title}
              className="min-w-[220px] rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]"
            >
              <h3 className="mb-2 text-lg font-bold text-navy-950">{c.title}</h3>
              <p className="text-sm leading-relaxed text-navy-700">{c.body}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-navy-100 pt-10">
          <h3 className="mb-6 text-lg font-bold text-navy-950">Pricing</h3>
          <div className="mb-12 grid gap-4 sm:grid-cols-4">
            {CREDIT_PACKS.map(({ sku }) => (
              <div
                key={sku}
                className="rounded-xl border border-navy-100 bg-white p-6 text-center shadow-[var(--shadow-card)]"
              >
                <p className="text-2xl font-extrabold text-navy-950">
                  {formatPrice(PRICING[sku].priceCents)}
                </p>
                <p className="text-sm text-navy-600">
                  {PRICING[sku].credits} session{PRICING[sku].credits > 1 ? "s" : ""}
                </p>
                {PRICING[sku].credits > 1 && (
                  <p className="mt-1 text-xs text-navy-400">
                    {formatPrice(PRICING[sku].priceCents / PRICING[sku].credits)} / session
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-12 border-t border-navy-100 pt-10">
          <h3 className="mb-6 text-lg font-bold text-navy-950">Scheduling</h3>
          <div className="grid grid-flow-col auto-cols-fr gap-6 overflow-x-auto">
            {SCHEDULING_RULES.map((rule) => (
              <div
                key={rule.title}
                className="min-w-[220px] rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]"
              >
                <h4 className="mb-2 text-lg font-bold text-navy-950">{rule.title}</h4>
                <p className="text-sm leading-relaxed text-navy-700">{rule.body}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-navy-600">
          Questions? Email <ObfuscatedEmail />
        </p>
      </section>

      <footer className="border-t border-navy-100 bg-white">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-navy-500 sm:px-8">
          <span>© Provable Learning</span>
          <nav className="flex gap-4">
            <Link href="/terms" className="hover:text-navy-800">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-navy-800">
              Privacy
            </Link>
            <Link href="/refund-policy" className="hover:text-navy-800">
              Refunds
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
