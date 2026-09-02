import Link from "next/link";
import { requireStudent } from "@/lib/auth/session";
import { listStudentSessions } from "@/lib/sessions/student";
import { labelFor } from "@/lib/accounts/purposes";

export const metadata = { title: "Your work" };

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The student's home screen — and their only notification channel, since students are never
 * emailed (`system/02-POLICIES.md` §11). Anything they need to know surfaces here, which is why
 * the page leads with what is waiting rather than with a calendar.
 */
export default async function StudentHome() {
  const student = await requireStudent();
  const sessions = await listStudentSessions();

  const now = Date.now();
  const upcoming = sessions.filter(
    (s) => s.status === "booked" && new Date(s.startsAt).getTime() > now,
  );
  const needsPrep = upcoming.filter((s) => !s.preparationComplete);
  const ready = sessions.filter((s) => s.materialsReady);

  return (
    <main className="mx-auto max-w-[880px] px-5 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-navy-950">
        Hi {student.name.split(" ")[0]}
      </h1>

      {upcoming.length === 0 && ready.length === 0 && (
        <section className="mt-8 rounded-xl border border-navy-100 bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <p className="text-lg font-semibold text-navy-950">Nothing to do right now</p>
          <p className="mx-auto mt-2 max-w-md text-navy-700">
            When a session is booked for you, whatever you need to do beforehand will show up here.
          </p>
        </section>
      )}

      {needsPrep.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-navy-950">Before your session</h2>
          <div className="flex flex-col gap-3">
            {needsPrep.map((session) => (
              <Link
                key={session.bookingId}
                href={`/student/prepare/${session.bookingId}`}
                className="block rounded-xl border border-gold-300 bg-gold-50 p-5 transition hover:border-gold-400"
              >
                <p className="font-bold text-navy-950">Tell your tutor what to prepare</p>
                <p className="mt-1 text-sm text-navy-700">
                  For your session on {when(session.startsAt)}
                  {session.purpose ? ` · ${labelFor(session.purpose)}` : ""}
                </p>
                <p className="mt-2 text-sm font-semibold text-navy-900">Start →</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {ready.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-navy-950">Your materials</h2>
          <div className="flex flex-col gap-3">
            {ready.map((session) => (
              <Link
                key={session.bookingId}
                href={`/student/materials/${session.bookingId}`}
                className="block rounded-xl border border-navy-100 bg-white p-5 shadow-[var(--shadow-card)] transition hover:border-navy-300"
              >
                <p className="font-bold text-navy-950">
                  What to work on next
                  {session.purpose ? ` — ${labelFor(session.purpose)}` : ""}
                </p>
                <p className="mt-1 text-sm text-navy-700">
                  From your session on {when(session.startsAt)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-navy-950">Coming up</h2>
          <div className="flex flex-col gap-3">
            {upcoming.map((session) => (
              <div
                key={session.bookingId}
                className="rounded-xl border border-navy-100 bg-white p-5 shadow-[var(--shadow-card)]"
              >
                <p className="font-bold text-navy-950">{when(session.startsAt)}</p>
                <p className="mt-1 text-sm text-navy-700">
                  60 minutes
                  {session.purpose ? ` · ${labelFor(session.purpose)}` : ""}
                  {session.preparationComplete ? " · you're all set" : ""}
                </p>
                {session.meetUrl ? (
                  <a
                    href={session.meetUrl}
                    className="mt-3 inline-block rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
                  >
                    Join the session
                  </a>
                ) : (
                  <p className="mt-3 text-sm text-navy-600">
                    The joining link will appear here before the session.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
