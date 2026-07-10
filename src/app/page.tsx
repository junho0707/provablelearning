import Link from "next/link";
import { SiteNav } from "@/components/site-nav";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-950 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-navy-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--navy-700)_0%,_transparent_50%)] opacity-40" />

        <div className="relative mx-auto flex max-w-[1120px] flex-col items-center px-5 py-24 text-center sm:px-8 sm:py-32">
          <p className="mb-4 text-sm font-bold uppercase tracking-widest text-gold-400">
            Free · Structured · Ground-up
          </p>
          <h1 className="mb-6 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-5xl lg:text-[3.5rem]">
            Learn math from the ground up — for free.
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg text-navy-200">
            One welcoming, guided path — course to theme to lesson, in order. Read and practice
            with no account. Add 1:1 tutoring only when you want it.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/courses"
              className="rounded-lg bg-gold-500 px-6 py-3 font-semibold text-navy-950 hover:bg-gold-400"
            >
              Start learning
            </Link>
            <Link
              href="/courses"
              className="rounded-lg border border-navy-600 px-6 py-3 font-semibold text-white hover:bg-navy-800"
            >
              Browse courses
            </Link>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              title: "A curated path, not a pile of videos",
              body: "Course → theme → lesson, in a deliberate order. Always know where you are and what comes next.",
            },
            {
              title: "Built for beginners first",
              body: "If math was never your thing, start here. Welcoming, plain-language explanations from the ground up.",
            },
            {
              title: "Tutoring when you want it",
              body: "Practice free forever. Buy credits and book a 45-minute 1:1 session only when you need a hand.",
            },
          ].map((c) => (
            <div
              key={c.title}
              className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]"
            >
              <h2 className="mb-2 text-lg font-bold text-navy-950">{c.title}</h2>
              <p className="text-sm leading-relaxed text-navy-700">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-navy-100 bg-white">
        <div className="mx-auto max-w-[1120px] px-5 py-8 text-sm text-navy-500 sm:px-8">
          © Provable Learning
        </div>
      </footer>
    </main>
  );
}
