import { requireStudent } from "@/lib/auth/session";
import { listStudentSessions } from "@/lib/sessions/student";
import { labelFor } from "@/lib/accounts/purposes";
import { viewerTimeZone } from "@/lib/booking/viewer-timezone";
import { sessionTime } from "@/lib/time-format";
import { PrepareModal } from "@/components/student/prepare-modal";
import { BTN, H1, H2, NOTICE } from "@/lib/ui";

export const metadata = { title: "Your work" };

/**
 * The student's home screen — and their only notification channel, since students are never
 * emailed (`system/02-POLICIES.md` §11).
 *
 * One block per upcoming session, holding everything about it: when it is, how to join, and what
 * the tutor still needs to know. The prep used to be a separate list at the top of the page, which
 * meant a student with two sessions booked read two "tell your tutor" rows and had to match each
 * one back to a date further down.
 *
 * What is waiting is marked by a gold left rule, the one colour the site spends on "this is for
 * you" — the same accent the landing gives its offer band.
 */
export default async function StudentHome() {
  const student = await requireStudent();
  const sessions = await listStudentSessions();
  const timeZone = await viewerTimeZone();

  const now = Date.now();
  const upcoming = sessions.filter(
    (s) => s.status === "booked" && new Date(s.startsAt).getTime() > now,
  );

  return (
    <main className="mx-auto max-w-[880px] px-6 py-16 sm:px-10">
      <h1 className={H1}>Hi {student.name.split(" ")[0]}</h1>

      {upcoming.length === 0 ? (
        <p className={`mt-10 ${NOTICE} text-center`}>
          <strong className="font-semibold text-navy-950">Nothing to do right now.</strong> When a
          session is booked for you, whatever you need to do beforehand will show up here.
        </p>
      ) : (
        <section className="mt-12">
          <h2 className={`mb-6 ${H2}`}>Coming up</h2>
          <div className="flex flex-col gap-5">
            {upcoming.map((session) => (
              <article key={session.bookingId} className="border border-navy-950/10 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div>
                    <p className="text-[0.9375rem] font-semibold text-navy-950">
                      {sessionTime(session.startsAt, timeZone)}
                    </p>
                    <p className="mt-1 text-[0.875rem] text-navy-700">
                      60 minutes
                      {session.purpose ? ` · ${labelFor(session.purpose)}` : ""}
                    </p>
                  </div>
                  {session.meetUrl ? (
                    <a href={session.meetUrl} className={BTN}>
                      Join the session
                    </a>
                  ) : (
                    <p className="text-[0.875rem] text-navy-950/55">
                      The joining link will appear here before the session.
                    </p>
                  )}
                </div>

                <div className="border-t border-navy-950/10">
                  <PrepareModal
                    bookingId={session.bookingId}
                    title="Tell your tutor what to prepare"
                    trigger={
                      session.preparationComplete ? (
                        <span className="block px-5 py-4 text-[0.875rem] text-navy-700 hover:bg-navy-50">
                          <strong className="font-semibold text-navy-950">You&apos;re all set.</strong>{" "}
                          Change what you told your tutor →
                        </span>
                      ) : (
                        <span className="block border-l-2 border-gold-500 bg-gold-100 px-5 py-4 hover:bg-gold-200">
                          <span className="block text-[0.9375rem] font-semibold text-navy-950">
                            Tell your tutor what to prepare
                          </span>
                          <span className="mt-1 block text-[0.875rem] text-navy-800">
                            A few questions, so your hour is ready for you.
                          </span>
                          <span className="mt-3 block text-[0.875rem] font-semibold text-navy-950">
                            Start →
                          </span>
                        </span>
                      )
                    }
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
