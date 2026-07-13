import Link from "next/link";
import { SiteNav } from "@/components/site-nav";

/** Global 404 — always links back into the Learning Path (AT-CONTENT-002). */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa]">
      <SiteNav />
      <main className="flex flex-1 items-center justify-center px-5 py-24 text-center">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-gold-500">404</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-950">
            We couldn&apos;t find that page
          </h1>
          <p className="mx-auto mt-3 max-w-md text-navy-700">
            The lesson or page you&apos;re after doesn&apos;t exist. Head back to the Learning Path
            and pick up where you left off.
          </p>
          <Link
            href="/courses"
            className="mt-8 inline-block rounded-lg bg-navy-900 px-6 py-3 font-semibold text-white hover:bg-navy-800"
          >
            Browse courses
          </Link>
        </div>
      </main>
    </div>
  );
}
