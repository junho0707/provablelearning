import Link from "next/link";
import { listMaterialsQueue } from "@/lib/sessions/materials";
import { MATERIALS_DUE_HOURS } from "@/lib/policy";

export const metadata = { title: "Admin — materials queue" };

function Row({
  session,
  overdue,
}: {
  session: { bookingId: string; startsAt: string; studentName: string; hoursOverdue: number };
  overdue: boolean;
}) {
  return (
    <li>
      <Link
        href={`/admin/bookings/${session.bookingId}`}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 transition hover:border-navy-400 ${
          overdue ? "border-[var(--error)] bg-[var(--error-light)]" : "border-navy-100 bg-white"
        }`}
      >
        <span className="font-semibold text-navy-950">{session.studentName}</span>
        <span className="text-sm text-navy-600">
          {new Date(session.startsAt).toLocaleString()}
          {overdue ? ` · ${session.hoursOverdue}h overdue` : ""}
        </span>
      </Link>
    </li>
  );
}

/** Sessions that have happened but have nothing published yet (F8). */
export default async function MaterialsQueuePage() {
  const { due, overdue } = await listMaterialsQueue();

  return (
    <div>
      <h1 className="mb-1 text-xl font-extrabold text-navy-950">Materials queue</h1>
      <p className="mb-8 text-sm text-navy-600">
        Every session that has happened and has nothing published yet. The target is{" "}
        {MATERIALS_DUE_HOURS} hours.
      </p>

      {overdue.length === 0 && due.length === 0 && (
        <p className="rounded-lg border border-navy-100 bg-white px-4 py-6 text-center text-navy-600">
          Nothing outstanding.
        </p>
      )}

      {overdue.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-[var(--error)]">
            Overdue
          </h2>
          <ul className="flex flex-col gap-2">
            {overdue.map((session) => (
              <Row key={session.bookingId} session={session} overdue />
            ))}
          </ul>
        </section>
      )}

      {due.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-navy-400">
            Still in the window
          </h2>
          <ul className="flex flex-col gap-2">
            {due.map((session) => (
              <Row key={session.bookingId} session={session} overdue={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
