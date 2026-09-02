import Link from "next/link";
import { redirect } from "next/navigation";
import { listProfiles } from "@/lib/accounts/profiles";
import { getBalance } from "@/lib/credits/balance";
import { currentBuyerId } from "@/lib/auth/session";
import { labelFor } from "@/lib/accounts/purposes";
import { PRICING, formatPrice } from "@/lib/pricing";

export const metadata = { title: "Dashboard" };

/**
 * The buyer's hub (`system/05-SURFACES.md` §2). F2 requires a specific empty state: an account with
 * no students shows one prompt and nothing else, because every other surface — booking, the First
 * Session promo, credits — is meaningless until there is someone to book for.
 */
export default async function DashboardPage() {
  const buyerId = await currentBuyerId();
  if (!buyerId) redirect("/login?next=/dashboard");

  const [profiles, balance] = await Promise.all([listProfiles(), getBalance()]);

  if (profiles.length === 0) {
    return (
      <main className="mx-auto max-w-[720px] px-5 py-24 text-center sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-navy-950">
          Let&apos;s add who&apos;s learning
        </h1>
        <p className="mx-auto mt-3 max-w-md text-navy-700">
          Add a student to get started. You can add more than one, and each gets their own first
          session at {formatPrice(PRICING.first_session.priceCents)}.
        </p>
        <Link
          href="/account"
          className="mt-8 inline-block rounded-lg bg-navy-900 px-6 py-3 font-semibold text-white hover:bg-navy-800"
        >
          Add a student
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-[-0.01em] text-navy-950 sm:text-4xl">
          Dashboard
        </h1>
        <p className="text-navy-700">
          <strong className="text-navy-950">{balance}</strong> credit{balance === 1 ? "" : "s"} ·{" "}
          <Link href="/credits" className="font-semibold text-navy-600 hover:text-navy-900">
            Buy more
          </Link>
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-4">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-lg font-bold text-navy-950">{profile.name}</p>
                <p className="mt-0.5 text-sm text-navy-600">
                  {[profile.grade, profile.currentMathClass].filter(Boolean).join(" · ") ||
                    "No class set"}
                </p>
                {profile.primaryPurpose && (
                  <p className="mt-1 text-sm text-navy-700">{labelFor(profile.primaryPurpose)}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-3 text-sm font-semibold">
                <Link
                  href={`/book?student=${profile.id}`}
                  className="rounded-lg bg-navy-900 px-4 py-2 text-white hover:bg-navy-800"
                >
                  Book a session
                </Link>
                <Link
                  href="/sessions"
                  className="rounded-lg border border-navy-200 px-4 py-2 text-navy-800 hover:border-navy-400"
                >
                  Sessions
                </Link>
              </div>
            </div>

            {!profile.hasLogin && (
              <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">
                {profile.name} doesn&apos;t have a sign-in yet — they&apos;ll need one to do session
                prep and see their materials.{" "}
                <Link href="/account" className="font-semibold text-navy-900 underline">
                  Set one up
                </Link>
              </p>
            )}
          </div>
        ))}
      </div>

      <Link
        href="/account"
        className="mt-4 block rounded-xl border border-dashed border-navy-200 px-4 py-4 text-center text-sm font-semibold text-navy-600 hover:border-navy-400 hover:text-navy-900"
      >
        + Add another student
      </Link>
    </main>
  );
}
