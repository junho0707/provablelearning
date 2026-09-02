import { requireStudent } from "@/lib/auth/session";

export const metadata = { title: "Your work" };

/**
 * The student's home screen — and their only notification channel, since students are never
 * emailed (`system/02-POLICIES.md` §11). Anything they need to know surfaces here.
 *
 * Session lists, pre-session work and delivered materials are filled in by R4; this is the shell
 * and the empty state, which F6 step 1 requires to say plainly that there is nothing to do rather
 * than presenting a tool with nothing in it.
 */
export default async function StudentHome() {
  const student = await requireStudent();

  return (
    <main className="mx-auto max-w-[880px] px-5 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight text-navy-950">
        Hi {student.name.split(" ")[0]}
      </h1>

      <section className="mt-8 rounded-xl border border-navy-100 bg-white p-8 text-center shadow-[var(--shadow-card)]">
        <p className="text-lg font-semibold text-navy-950">Nothing to do right now</p>
        <p className="mx-auto mt-2 max-w-md text-navy-700">
          When a session is booked for you, whatever you need to do beforehand will show up here.
        </p>
      </section>
    </main>
  );
}
