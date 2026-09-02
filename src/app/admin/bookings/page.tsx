import Link from "next/link";
import { listAllBookings } from "@/lib/admin/bookings";
import { NoShowButton } from "./no-show-button";

export const metadata = { title: "Admin — bookings" };

/** TASK-ADMIN-001, "bookings calendar". Bookings missing a `meet_url` surface here for manual repair (INV-BOOK-2, S10). */
export default async function AdminBookingsPage() {
  const bookings = await listAllBookings();
  const missingLink = bookings.filter((b) => b.status === "booked" && !b.meetUrl);

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-navy-950">Bookings</h1>

      {missingLink.length > 0 && (
        <section className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-bold text-amber-900">Missing Meet link — needs manual repair</h2>
          <ul className="space-y-1 text-sm text-amber-900">
            {missingLink.map((b) => (
              <li key={b.id}>
                {new Date(b.startsAt).toLocaleString()} — {b.learnerName} ({b.buyerEmail})
              </li>
            ))}
          </ul>
        </section>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-navy-100 text-navy-500">
            <th className="py-2">When</th>
            <th className="py-2">Learner</th>
            <th className="py-2">Buyer</th>
            <th className="py-2">Status</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} className="border-b border-navy-50">
              <td className="py-2">{new Date(b.startsAt).toLocaleString()}</td>
              <td className="py-2">{b.learnerName}</td>
              <td className="py-2">{b.buyerEmail}</td>
              <td className="py-2">{b.status}</td>
              <td className="py-2 flex items-center gap-3">
                {b.status === "booked" && <NoShowButton bookingId={b.id} />}
                <Link href={`/admin/bookings/${b.id}`} className="text-xs font-semibold text-navy-700 underline">
                  Plan
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
