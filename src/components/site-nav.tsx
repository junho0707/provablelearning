import Link from "next/link";

/**
 * Top navigation shared across public pages.
 * Minimal at M0; role-aware links (dashboard, admin) are added in later milestones.
 */
export function SiteNav() {
  return (
    <header className="border-b border-navy-100 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight text-navy-950">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy-900 text-sm text-gold-400">
            P
          </span>
          <span className="text-lg">Provable Learning</span>
        </Link>
        <div className="flex items-center gap-6 text-sm font-semibold">
          <Link href="/courses" className="text-navy-700 hover:text-navy-950">
            Courses
          </Link>
          <Link
            href="/courses"
            className="rounded-lg bg-navy-900 px-4 py-2 text-white hover:bg-navy-800"
          >
            Start learning
          </Link>
        </div>
      </nav>
    </header>
  );
}
