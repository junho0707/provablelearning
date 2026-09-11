import Link from "next/link";

/** Shared with the landing page and the legal pages, so a link added to one never goes missing from the other. */
export function SiteFooter() {
  return (
    <footer className="bg-navy-950 text-navy-300">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-[0.8125rem] sm:px-10">
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
  );
}
