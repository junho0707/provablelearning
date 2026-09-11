import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { currentBuyerId, currentStudent } from "@/lib/auth/session";
import { BTN_LG, EYEBROW, GROUND, H1 } from "@/lib/ui";

/**
 * Global 404. Where "back" goes depends on who is asking: content is not public
 * (`system/00-BUSINESS.md` §1), so a signed-out visitor has only the marketing page to return to,
 * while sending a signed-in buyer or student there drops them out of the product they were already
 * inside. The two principals have different homes (`01-ACTORS.md`), so the student goes to theirs.
 */
export default async function NotFound() {
  const student = await currentStudent();
  const buyerId = student ? null : await currentBuyerId();

  const destination = student ? "/student" : buyerId ? "/dashboard" : "/";
  const signedIn = Boolean(student || buyerId);

  return (
    <div style={{ background: GROUND }} className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex flex-1 items-center justify-center px-6 py-24 text-center sm:px-10">
        <div>
          <p className={EYEBROW}>404</p>
          <h1 className={`mt-5 ${H1}`}>We couldn&apos;t find that page</h1>
          <p className="mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed text-navy-700">
            {signedIn
              ? "That page doesn't exist. Everything you're signed in for is still where you left it."
              : "That page doesn't exist. Head back to the start."}
          </p>
          <Link href={destination} className={`mt-10 ${BTN_LG}`}>
            {signedIn ? "Back to your dashboard" : "Back to home"}
          </Link>
        </div>
      </main>
    </div>
  );
}
