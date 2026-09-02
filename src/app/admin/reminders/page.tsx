import { listSmsWorklist } from "@/lib/admin/reminders";
import { formatTimeRemaining } from "@/lib/admin/time-remaining";
import { MarkSentButton } from "./mark-sent-button";

export const metadata = { title: "Admin — SMS reminders" };

/** TASK-ADMIN-002, REQ-ADMIN-004. A worklist, not an integration — the operator sends texts personally. */
export default async function RemindersPage() {
  const entries = await listSmsWorklist();
  const pending = entries.filter((e) => !e.sent);

  return (
    <div>
      <h1 className="mb-2 text-xl font-extrabold text-navy-950">SMS reminders</h1>
      <p className="mb-6 text-sm text-navy-600">Next 48 hours, soonest first. Send these texts yourself, then mark them sent.</p>

      {pending.length === 0 ? (
        <p className="text-sm text-navy-500">Nothing due.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((e) => (
            <li key={e.bookingId} className="rounded-lg border border-navy-100 p-4 text-sm">
              <p className="font-semibold text-navy-900">
                In {formatTimeRemaining(e.minutesRemaining)} — {e.phone ?? "no phone on file"}
              </p>
              <p className="mt-1 text-navy-700">{e.message}</p>
              <MarkSentButton bookingId={e.bookingId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
