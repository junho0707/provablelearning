import Link from "next/link";
import { ContactLink } from "@/components/contact-link";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { SignUpButton } from "@/components/auth/sign-up-button";
import { PRICING, formatPrice } from "@/lib/pricing";
import { POLICY_COPY } from "@/lib/policy";
import { PURPOSES, PURPOSE_LABEL, type Purpose } from "@/lib/accounts/purposes";
import { createClient } from "@/lib/supabase/server";
import { getPurchaseHistory } from "@/lib/credits/history";

const FIRST_SESSION_PRICE = formatPrice(PRICING.first_session.priceCents);

// Copy rule: strengths and next steps, never deficits (spec/14, ADR-005).
const IS_THIS_FOR_YOU = [
  {
    title: "School year math help",
    bullets: [
      "Review what you've already learned",
      "Preview what's coming next",
      "Prepare for quizzes and tests",
    ],
  },
  {
    title: "Math diagnostics",
    bullets: [
      "Figure out your strengths and weaknesses",
      "For test prep — SAT, PSAT, ACT",
      "Or for math up to where you are now",
    ],
  },
  {
    title: "Real understanding",
    bullets: [
      "Focus on conceptual understanding",
      "School subjects, math up to where you are, or special topics I'll guide you through",
    ],
  },
];

/**
 * What a later session can be for. The **terms** are the live purpose vocabulary from
 * `lib/accounts/purposes.ts` — the same values the booking form asks and stores — so the page
 * cannot advertise a category the product doesn't offer. Only these one-liners are page copy; the
 * sub-purposes are folded into them rather than listed, because listing every option made the panel
 * unreadable.
 */
const PURPOSE_BLURB: Record<Purpose, string> = {
  school: "Understanding a topic, getting ahead, reviewing, or preparing for a test.",
  test_prep: "SAT, PSAT or ACT. Work at your own pace, then check in.",
  math_diagnostic: "Find where the gaps are, then work through them.",
};

// `system/02-POLICIES.md` §2-§5. Every sentence comes from POLICY_COPY so the page cannot state a
// rule the code doesn't enforce — the numbers live in one module and the drift test guards them.
const SCHEDULING_RULES = [
  {
    title: "Booking window",
    bullets: [
      `Book up to ${POLICY_COPY.horizon} ahead.`,
      `At least ${POLICY_COPY.minNotice}' notice.`,
      POLICY_COPY.release,
    ],
  },
  {
    title: "Cancel or reschedule",
    bullets: [
      POLICY_COPY.freeCancelBullet,
      POLICY_COPY.lateCancelBullet,
      POLICY_COPY.lateCancelCapBullet,
    ],
  },
  { title: "Credits", bullets: [POLICY_COPY.creditsNeverExpire] },
];

/** The two kinds of login and what each can do. `system/01-ACTORS.md` and `06-AUTH-AND-COPPA.md`. */
const ACCOUNT_KINDS = [
  {
    title: "Parent account",
    bullets: [
      "Signs in with Google or email",
      "Buys credits and First Sessions",
      "Books, cancels, and messages the tutor",
      "Sets up a sign-in for each student",
    ],
  },
  {
    title: "Student account",
    bullets: [
      "Set up by the parent — username and password",
      "Prepares for sessions and views materials",
      "No billing, no booking, no email ever sent to it",
    ],
  },
];

const BUNDLES: Array<{ sku: "credits_1" | "credits_2" | "credits_4" | "credits_8" }> = [
  { sku: "credits_1" },
  { sku: "credits_2" },
  { sku: "credits_4" },
  { sku: "credits_8" },
];

/**
 * The page is a stack of full-bleed panels butted directly against each other — no gutters, no
 * radius, no shadows.
 *
 * **Navy bookends a light body.** The hero opens on navy and the closing CTA lands on navy; every
 * panel between them shares the off-white ground and is separated from its neighbour by its own
 * padding. Brand navy therefore marks the two moments that are about the decision — arriving and
 * signing up — and never interrupts the reading in between.
 *
 * **The only horizontal rules are the ones bounding a grid.** A separate seam between sections put
 * a second rule a few rem above each grid's own, which read as a stray line rather than a divide.
 *
 * **A new section goes inside the light body.** Giving it its own ground would break the bookend
 * into a stripe.
 *
 * The gold strip is outside the sequence — a rule laid across the stack, not a band of it.
 */
const OFF_WHITE = "#faf9f7";

/**
 * Kicker. Small, wide-tracked — it is **not** a heading, and only ever sits above one (or, in the
 * hero, below the h1 it belongs to). A section whose label has no headline under it uses
 * `SectionTitle` instead; sizing a kicker up to stand in for a headline is what it must not do.
 *
 * On the navy bookends navy is invisible, so `dark` swaps it for gold — the only brand colour that
 * reads on that ground, and the only place gold appears as text.
 */
function Eyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p
      className={`mb-5 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] ${
        dark ? "text-gold-500" : "text-navy-950"
      }`}
    >
      {children}
    </p>
  );
}

/**
 * A section's own heading, for the panels that label themselves in a word and have no headline to
 * kick off. It is a real `h2`, so the `h3`s inside those grids sit under a heading rather than
 * under nothing. Smaller than the headline in the split panel — one word does not need that size.
 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-8 text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-tight tracking-[-0.025em]">
      {children}
    </h2>
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

  const ctaWith = (className: string) => (
    <SignUpButton signedIn={Boolean(user)} hasFirstSession={hasFirstSession} className={className} />
  );

  return (
    <main className="bg-white">
      <SiteNav />

      {/* ── Bookend (navy) — the statement, carrying who it's for ──────────────────────────── */}
      <section className="bg-navy-950 text-white">
        <div className="mx-auto max-w-[1200px] px-6 py-24 sm:px-10 sm:py-28">
          <h1 className="text-center text-[clamp(2.25rem,5.6vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
            Need Math Help?
          </h1>

          <div className="mt-14 text-center">
            <Eyebrow dark>Who it&apos;s for</Eyebrow>
          </div>
          {/* `border-y`, not `border-t` alone: the vertical rules then meet a horizontal line at
              both ends instead of stopping in open space. Cells are divided by hairlines, never by
              gaps — a gap would make them read as cards. */}
          <div className="grid border-y border-white/15 sm:grid-cols-3">
            {IS_THIS_FOR_YOU.map((item, i) => (
              <div
                key={item.title}
                className="border-b border-white/15 py-8 last:border-b-0 sm:border-b-0 sm:border-r sm:px-8 sm:py-10 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
              >
                <p className="mb-4 text-[0.6875rem] font-semibold tracking-[0.18em] text-white/35">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">{item.title}</h2>
                <ul className="list-disc space-y-2 pl-4 text-[0.9375rem] leading-relaxed text-navy-200 marker:text-white/40">
                  {item.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Banner — outside the alternation ────────────────────────────────────────────────── */}
      <section className="bg-gold-500 text-navy-950">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-5 px-6 py-12 text-center sm:px-10">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-navy-950/55">
            Limited time
          </p>
          <p className="text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold leading-none tracking-[-0.025em]">
            First session <span className="tabular-nums">{FIRST_SESSION_PRICE}</span>
          </p>
          {ctaWith(
            "inline-block bg-navy-950 px-7 py-3.5 text-[0.9375rem] font-semibold text-white hover:bg-navy-800",
          )}
        </div>
      </section>

      {/* ── Body — what later sessions are for. First panel of the light body: the gold strip is
             its seam, so it takes no hairline. ──────────────────────────────────────────────── */}
      <section style={{ background: OFF_WHITE }} className="text-navy-950">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <Eyebrow>After your first session</Eyebrow>
            <h2 className="text-[clamp(1.875rem,3.5vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.025em]">
              Keep going with 1&nbsp;hour 1:1 credit sessions.
            </h2>
          </div>
          <dl className="lg:col-span-7">
            {PURPOSES.map((purpose) => (
              <div
                key={purpose}
                className="grid gap-2 border-t border-navy-950/10 py-6 last:border-b sm:grid-cols-[11rem_1fr] sm:gap-8"
              >
                <dt className="text-[0.9375rem] font-semibold">{PURPOSE_LABEL[purpose]}</dt>
                <dd className="text-[0.9375rem] leading-relaxed text-navy-700">
                  {PURPOSE_BLURB[purpose]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Body — pricing ─────────────────────────────────────────────────────────────────── */}
      <section style={{ background: OFF_WHITE }} className="text-navy-950">
        <div className="mx-auto max-w-[1200px] px-6 py-12 sm:px-10 sm:py-16">
          <SectionTitle>Pricing</SectionTitle>
          <div className="grid border-y border-navy-950/10 sm:grid-cols-5">
            {/* The First Session leads the row so the $25 -> $75 step is read here, not inferred.
                gold-600, not gold-500: the 500 is drawn for navy and goes muddy on off-white. */}
            <div className="flex items-baseline justify-between border-b border-navy-950/10 py-6 last:border-b-0 sm:block sm:border-b-0 sm:border-r sm:px-8 sm:py-10 sm:first:pl-0 sm:last:border-r-0">
              <p className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums text-gold-600">
                {formatPrice(PRICING.first_session.priceCents)}
              </p>
              <div className="text-right sm:mt-4 sm:text-left">
                <p className="text-[0.9375rem] text-navy-700">First session</p>
                <p className="mt-0.5 text-[0.8125rem] text-navy-950/40">one per student</p>
              </div>
            </div>
            {BUNDLES.map(({ sku }) => (
              <div
                key={sku}
                className="flex items-baseline justify-between border-b border-navy-950/10 py-6 last:border-b-0 sm:block sm:border-b-0 sm:border-r sm:px-8 sm:py-10 sm:first:pl-0 sm:last:border-r-0"
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

      {/* ── Body — scheduling ──────────────────────────────────────────────────────────────── */}
      <section style={{ background: OFF_WHITE }} className="text-navy-950">
        <div className="mx-auto max-w-[1200px] px-6 py-12 sm:px-10 sm:py-16">
          <SectionTitle>Scheduling</SectionTitle>
          <div className="grid border-y border-navy-950/10 sm:grid-cols-3">
            {SCHEDULING_RULES.map((rule) => (
              <div
                key={rule.title}
                className="border-b border-navy-950/10 py-8 last:border-b-0 sm:border-b-0 sm:border-r sm:px-8 sm:py-10 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
              >
                <h3 className="mb-3 text-lg font-semibold tracking-[-0.01em]">{rule.title}</h3>
                <ul className="list-disc space-y-2 pl-4 text-[0.9375rem] leading-relaxed text-navy-700 marker:text-navy-950/30">
                  {rule.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Body — accounts ────────────────────────────────────────────────────────────────── */}
      <section style={{ background: OFF_WHITE }} className="text-navy-950">
        <div className="mx-auto max-w-[1200px] px-6 py-12 sm:px-10 sm:py-16">
          <SectionTitle>Accounts</SectionTitle>
          <div className="grid border-y border-navy-950/10 sm:grid-cols-2">
            {ACCOUNT_KINDS.map((kind) => (
              <div
                key={kind.title}
                className="border-b border-navy-950/10 py-8 last:border-b-0 sm:border-b-0 sm:border-r sm:px-8 sm:py-10 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
              >
                <h3 className="mb-3 text-lg font-semibold tracking-[-0.01em]">{kind.title}</h3>
                <ul className="list-disc space-y-2 pl-4 text-[0.9375rem] leading-relaxed text-navy-700 marker:text-navy-950/30">
                  {kind.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-8 text-[0.8125rem] text-navy-950/45">
            More in the{" "}
            <Link href="/privacy" className="underline hover:text-navy-950">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ── Bookend (navy) — the close. Pairs with the hero: navy marks arriving and signing up,
             and nothing between them. It runs straight into the navy footer, which reads as one
             foot to the page rather than as another band. ───────────────────────────────────── */}
      <section className="bg-navy-950 text-white">
        <div className="mx-auto max-w-[1200px] px-6 py-24 text-center sm:px-10 sm:py-28">
          <h2 className="mx-auto max-w-[20ch] text-[clamp(1.875rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
            Try one session.
          </h2>
          <div className="mt-10">
            {ctaWith(
              "inline-block bg-gold-500 px-8 py-4 text-[0.9375rem] font-semibold text-navy-950 hover:bg-gold-400",
            )}
          </div>
          <div className="mt-6">
            <ContactLink />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
