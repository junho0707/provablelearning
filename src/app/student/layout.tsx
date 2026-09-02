import Link from "next/link";
import { currentStudent } from "@/lib/auth/session";
import { signOutStudent } from "@/lib/auth/student";

/**
 * The student shell. Intentionally almost empty of navigation: a student's whole surface is their
 * own home screen and the work waiting on it (`system/05-SURFACES.md` §3). There is nowhere else
 * for them to go — no billing, no booking, no messages — so offering tabs would only advertise
 * doors that are locked.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const student = await currentStudent();

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      {student && (
        <header className="border-b border-navy-100 bg-white">
          <div className="mx-auto flex h-16 max-w-[880px] items-center justify-between px-5">
            <Link href="/student" className="flex items-center gap-2 font-extrabold text-navy-950">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy-900 text-sm text-gold-400">
                P
              </span>
              <span className="text-lg">Provable Learning</span>
            </Link>
            <div className="flex items-center gap-4 text-sm font-semibold">
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
