import { listAllAvailability } from "@/lib/admin/availability";
import { AvailabilityForms } from "./availability-forms";

export const metadata = { title: "Admin — availability" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** TASK-ADMIN-001, "availability editor" (F11). */
export default async function AvailabilityPage() {
  const { rules, exceptions } = await listAllAvailability();

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-navy-950">Availability</h1>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-bold text-navy-900">Weekly template</h2>
        <ul className="space-y-1 text-sm">
          {rules.map((r) => (
            <li key={r.id} className={r.active ? "" : "text-navy-400 line-through"}>
              {WEEKDAYS[r.weekday]} {r.startTime}–{r.endTime}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-bold text-navy-900">Exceptions</h2>
        <ul className="space-y-1 text-sm">
          {exceptions.map((e) => (
            <li key={e.id}>
              {e.date} — {e.kind}
              {e.startTime ? ` ${e.startTime}–${e.endTime}` : " (whole day)"}
            </li>
          ))}
        </ul>
      </section>

      <AvailabilityForms />
    </div>
  );
}
