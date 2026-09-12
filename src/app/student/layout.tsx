import Link from "next/link";
import { currentStudent } from "@/lib/auth/session";
import { signOutStudent } from "@/lib/auth/student";
import { BrandWordmark } from "@/components/brand-wordmark";
import { TimeZoneProbe } from "@/components/timezone-probe";
import { GROUND } from "@/lib/ui";

/**
 * The student shell. Intentionally almost empty of navigation: a student's whole surface is their
 * own home screen and the work waiting on it (`system/05-SURFACES.md` §3). There is nowhere else
 * for them to go — no billing, no booking, no messages — so offering tabs would only advertise
 * doors that are locked.
 *
 * The header is the buyer's `SiteNav` in miniature — a flat band on white, divided from the page
 * by a hairline and nothing else — so the two shells are recognisably the same site.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const student = await currentStudent();

  return (
    <div style={{ background: GROUND }} className="min-h-screen">
      <TimeZoneProbe />
      {student && (
        <header className="sticky top-0 z-40 border-b border-navy-950/10 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[880px] items-center justify-between px-6 sm:px-10">
            <Link href="/student" className="flex items-center text-navy-950">
              <BrandWordmark className="h-[22px] w-auto" />
            </Link>
            <div className="flex items-center gap-5 text-sm font-medium">
              <span className="text-navy-700">{student.name}</span>
              <form action={signOutStudent}>
                <button type="submit" className="text-navy-600 hover:text-navy-950">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
      )}
      {children}
    </div>
  );
}
