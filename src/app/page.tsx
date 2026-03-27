import Link from 'next/link';
import { ServerNav } from '@/components/server-nav';
import { getNavProps } from '@/lib/auth/get-nav-props';

export const revalidate = 60;

export default async function Home() {
  const navProps = await getNavProps();
  const userRole = navProps.userRole;

  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      <ServerNav {...navProps} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-navy-950 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-navy-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--navy-700)_0%,_transparent_50%)] opacity-40" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--navy-800)_0%,_transparent_40%)] opacity-50" />

        <div className="relative mx-auto flex min-h-[60vh] max-w-[1280px] flex-col items-center justify-center px-5 text-center sm:min-h-[70vh] sm:px-8 lg:px-16">
          <p className="mb-4 text-sm font-bold uppercase tracking-widest text-gold-400">
            Digital SAT &amp; General Math Tutoring
          </p>
          <h1 className="mb-6 text-4xl font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-5xl lg:text-[3.5rem]">
            Small Group Tutoring for Digital SAT and Math.
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg text-navy-200">
            Max 3 students &mdash; structured sessions with dedicated 1-on-1 time.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {!userRole && (
              <Link
                href="/book"
                className="rounded-xl bg-gold-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-gold-500/25 hover:bg-gold-400 min-w-[240px] text-center"
              >
                Book a Free Consultation
              </Link>
            )}
            <Link
              href="/offerings"
              className="rounded-xl border border-white/30 px-8 py-3 text-sm font-semibold text-navy-100 hover:border-white/60 hover:text-white min-w-[240px] text-center"
            >
              View Schedule
            </Link>
          </div>
        </div>
      </section>

      {/* The Provable Method */}
      <section className="px-5 py-16 sm:px-8 sm:py-24 lg:px-16">
        <div className="mx-auto max-w-[1280px]">
          <h2 className="mb-4 text-center text-3xl font-bold tracking-tight text-navy-900 lg:text-4xl">
            How Sessions Work
          </h2>
          <p className="mx-auto mb-14 max-w-2xl text-center text-base text-slate-500">
            Each 1.5-hour session is structured so every student gets dedicated 1-on-1 attention,
            even in a group setting.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: 'Work on Materials',
                desc: 'Students receive structured materials — explanations, exercises, and progressively harder problems. Work at your own pace and write down questions as you go.',
                icon: (
                  <svg className="h-7 w-7 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                ),
              },
              {
                title: 'Regular Check-ins',
                desc: 'Every ~20 minutes, the tutor rotates to each student individually — reviewing your work, answering questions, and giving targeted feedback.',
                icon: (
                  <svg className="h-7 w-7 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                ),
              },
              {
                title: '30 Min of 1-on-1 Time',
                desc: 'With max 3 students, each student gets at least 3 dedicated 10-minute review sessions with the tutor throughout the class.',
                icon: (
                  <svg className="h-7 w-7 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div key={item.title} className="method-card rounded-xl border border-slate-200 bg-white p-8 text-center cursor-default">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gold-100">
                  {item.icon}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-navy-900">{item.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative overflow-hidden bg-navy-950 px-5 py-16 text-white sm:px-8 sm:py-24 lg:px-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--navy-800)_0%,_transparent_50%)] opacity-30 pointer-events-none" />
        <div className="mx-auto max-w-[1280px]">
          <h2 className="mb-16 text-center text-3xl font-bold tracking-tight text-white lg:text-4xl">
            Pricing
          </h2>
          <div className="mx-auto max-w-[400px]">
              <div className="pricing-card relative flex flex-col rounded-xl border border-slate-200 p-8">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <h3 className="text-lg font-semibold text-navy-900">Small Group</h3>
                </div>
                <p className="mb-4 text-sm text-slate-400">Max 3 students per session</p>
                <p className="mb-6">
                  <span className="text-3xl font-bold text-navy-900">$300</span>
                  <span className="text-sm font-medium text-slate-400"> for 4 weeks (8 sessions)</span>
                </p>
                <ul className="mb-8 flex-1 space-y-3">
                  {[
                    '1.5-hour sessions, 2 slots per week',
                    '30 minutes of dedicated 1-on-1 time per session',
                    'Digital SAT (RW, Math, or both) & General Math',
                    'Flexible slot selection',
                    'Cancel & reschedule anytime',
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/offerings"
                  className="block rounded-xl bg-navy-900 px-6 py-2.5 text-center text-sm font-semibold text-white hover:bg-navy-800"
                >
                  View Class Schedule
                </Link>
              </div>
          </div>
        </div>
      </section>

      {/* Why Provable Learning */}
      <section className="px-5 py-16 sm:px-8 sm:py-24 lg:px-16">
        <div className="mx-auto max-w-[1280px]">
          <h2 className="mb-16 text-center text-3xl font-bold tracking-tight text-navy-900 lg:text-4xl">
            Why Provable Learning
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                title: 'Welcome to All Levels',
                desc: 'From first-timers to students targeting 1500+.',
                icon: (
                  <svg className="h-7 w-7 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                ),
              },
              {
                title: 'Flexible Scheduling',
                desc: 'Pick your slots, cancel and reschedule easily.',
                icon: (
                  <svg className="h-7 w-7 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                ),
              },
              {
                title: 'Progress Tracking & Reports',
                desc: 'Get a detailed report at the end of each class showing exactly what improved.',
                icon: (
                  <svg className="h-7 w-7 text-gold-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-8 text-center cursor-default">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gold-100">
                  {item.icon}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-navy-900">{item.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-navy-950 px-5 py-16 text-white sm:px-8 sm:py-24 lg:px-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--navy-800)_0%,_transparent_50%)] opacity-30 pointer-events-none" />
        <div className="relative mx-auto max-w-[1280px] text-center">
          <h2 className="mb-2 text-3xl font-bold tracking-tight text-white lg:text-4xl">Ready to Start?</h2>
          <p className="mb-8 text-base text-navy-200">Create an account or book a free consultation to get started.</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {!userRole && (
              <Link
                href="/book"
                className="rounded-xl bg-gold-500 px-10 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gold-400"
              >
                Book a Free Consultation
              </Link>
            )}
            <Link
              href="/offerings"
              className="rounded-xl border border-white/30 px-10 py-3 text-sm font-semibold text-navy-100 hover:border-white/60 hover:text-white"
            >
              View Schedule
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-navy-950 px-8 py-10 text-center lg:px-16">
        <p className="text-sm text-navy-400">
          &copy; {new Date().getFullYear()} Provable Learning. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
