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

/**
 * The page is a stack of full-bleed panels butted directly against each other — no gutters, no
 * radius, no shadows. The seam between two sections *is* the change of background colour, which is
 * what gives the "poster boards attached together" reading. There are four panel templates and
 * deliberately no fifth; the restraint in template count is where the minimalism comes from, not
 * restraint in content.
 *
 * The one floating object on the page is the nav pill, which is why it is allowed blur and radius.
 */
const OFF_WHITE = "#faf9f7";

/** Numbered section label. Small, wide-tracked, gold — the only place gold appears as text. */
function Eyebrow({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <p className="mb-5 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-gold-500">
      <span className="text-gold-600/70">{index}</span>
      <span className="px-2 text-gold-600/40">—</span>
      {children}
    </p>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasFirstSession = user
    ? (await getPurchaseHistory()).some((p) => p.sku === "first_session")
    : false;

  return (
    <main className="bg-white">
      <SiteNav overlay />

      {/* ── Panel A — statement ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-navy-950 text-white">
        {/* Texture in place of photography. A worked derivation set very large and very faint does
            the job an image would, without stock photos of children at laptops. */}
        <p
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 bottom-0 hidden select-none font-serif text-[7rem] italic leading-[1.15] text-white/[0.04] lg:block"
        >
          a² + b²
          <br />
          = c²
        </p>

        <div className="relative mx-auto flex min-h-[78vh] max-w-[1200px] flex-col justify-end px-6 pb-20 pt-40 sm:px-10">
          <h1 className="max-w-[16ch] text-[clamp(2.75rem,7vw,5rem)] font-semibold leading-[0.95] tracking-[-0.03em]">
            Want to get better at math?
          </h1>
          <div className="mt-12 flex flex-col items-start gap-5 border-t border-white/15 pt-8 sm:flex-row sm:items-center sm:gap-10">
            <SignUpButton
              signedIn={Boolean(user)}
              hasFirstSession={hasFirstSession}
              className="bg-gold-500 px-8 py-4 text-[0.9375rem] font-semibold text-navy-950 hover:bg-gold-400"
            />
            {!hasFirstSession && (
              <p className="text-[0.9375rem] text-navy-200">
                Your first 1 hour session is{" "}
                <span className="font-semibold text-white">{FIRST_SESSION_PRICE}</span>.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Panel C — tile row ──────────────────────────────────────────────────────────────── */}
      <section style={{ background: OFF_WHITE }} className="text-navy-950">
        <div className="mx-auto max-w-[1200px] px-6 py-24 sm:px-10 sm:py-28">
          <Eyebrow index="01">Who it&apos;s for</Eyebrow>
          <h2 className="max-w-[24ch] text-[clamp(1.875rem,3.5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.025em]">
            Three reasons people start.
          </h2>
          {/* Cells are divided by hairlines, never by gaps — a gap would make them read as cards. */}
          <div className="mt-14 grid border-t border-navy-950/10 sm:grid-cols-3">
            {IS_THIS_FOR_YOU.map((item, i) => (
              <div
                key={item.title}
                className="border-b border-navy-950/10 py-8 sm:border-b-0 sm:border-r sm:px-8 sm:py-0 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
              >
                <p className="mb-4 pt-0 text-[0.6875rem] font-semibold tracking-[0.18em] text-navy-950/35 sm:pt-8">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mb-3 text-lg font-semibold tracking-[-0.01em]">{item.title}</h3>
                <ul className="space-y-2 text-[0.9375rem] leading-relaxed text-navy-700">
                  {item.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Panel B — split ─────────────────────────────────────────────────────────────────── */}
      <section className="bg-navy-950 text-white">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-6 py-24 sm:px-10 sm:py-28 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <Eyebrow index="02">After your first session</Eyebrow>
            <h2 className="text-[clamp(1.875rem,3.5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.025em]">
              Keep going with 1&nbsp;hour 1:1 credit sessions.
            </h2>
          </div>
          <dl className="lg:col-span-7">
            {CREDIT_AUDIENCES.map((c) => (
              <div
                key={c.title}
                className="grid gap-2 border-t border-white/15 py-6 last:border-b sm:grid-cols-[10rem_1fr] sm:gap-8"
              >
                <dt className="text-[0.9375rem] font-semibold">{c.title}</dt>
                <dd className="text-[0.9375rem] leading-relaxed text-navy-200">{c.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Panel D — data band ─────────────────────────────────────────────────────────────── */}
      <section style={{ background: OFF_WHITE }} className="text-navy-950">
        <div className="mx-auto max-w-[1200px] px-6 py-24 sm:px-10 sm:py-28">
          <Eyebrow index="03">Pricing</Eyebrow>
          <div className="grid border-t border-navy-950/10 sm:grid-cols-4">
            {CREDIT_PACKS.map(({ sku }) => (
              <div
                key={sku}
                className="flex items-baseline justify-between border-b border-navy-950/10 py-6 sm:block sm:border-b-0 sm:border-r sm:px-8 sm:py-10 sm:first:pl-0 sm:last:border-r-0"
              >
                <p className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                  {formatPrice(PRICING[sku].priceCents)}
                </p>
                <div className="text-right sm:mt-4 sm:text-left">
                  <p className="text-[0.9375rem] text-navy-700">
                    {PRICING[sku].credits} session{PRICING[sku].credits > 1 ? "s" : ""}
                  </p>
                  {PRICING[sku].credits > 1 && (
                    <p className="mt-0.5 text-[0.8125rem] tabular-nums text-navy-950/40">
                      {formatPrice(PRICING[sku].priceCents / PRICING[sku].credits)} / session
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Panel C — tile row ──────────────────────────────────────────────────────────────── */}
      <section className="border-t border-navy-950/10 bg-white text-navy-950">
        <div className="mx-auto max-w-[1200px] px-6 py-24 sm:px-10 sm:py-28">
          <Eyebrow index="04">Scheduling</Eyebrow>
          <div className="grid border-t border-navy-950/10 sm:grid-cols-2 lg:grid-cols-4">
            {SCHEDULING_RULES.map((rule) => (
              <div
                key={rule.title}
                className="border-b border-navy-950/10 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0 sm:first:pl-0"
              >
                <h3 className="mb-3 text-lg font-semibold tracking-[-0.01em]">{rule.title}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-navy-700">{rule.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Panel A — statement (close) ─────────────────────────────────────────────────────── */}
      <section className="bg-navy-950 text-white">
        <div className="mx-auto max-w-[1200px] px-6 py-24 sm:px-10 sm:py-28">
          <h2 className="max-w-[18ch] text-[clamp(1.875rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
            Start with one hour.
          </h2>
          <div className="mt-12 flex flex-col items-start gap-5 border-t border-white/15 pt-8 sm:flex-row sm:items-center sm:gap-10">
            <SignUpButton
              signedIn={Boolean(user)}
              hasFirstSession={hasFirstSession}
              className="bg-gold-500 px-8 py-4 text-[0.9375rem] font-semibold text-navy-950 hover:bg-gold-400"
            />
            <p className="text-[0.9375rem] text-navy-200">
              Questions? Email <ObfuscatedEmail />
            </p>
          </div>
        </div>
      </section>

      <footer className="bg-navy-950 text-navy-300">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 border-t border-white/10 px-6 py-8 text-[0.8125rem] sm:px-10">
          <span>© Provable Learning</span>
          <nav className="flex gap-6">
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/refund-policy" className="hover:text-white">
              Refunds
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
