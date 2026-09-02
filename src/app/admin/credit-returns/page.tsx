import { listPendingCreditReturns } from "@/lib/admin/credit-returns";
import { ResolveButtons } from "./resolve-buttons";

export const metadata = { title: "Admin — credit returns" };

/** TASK-ADMIN-001/BOOK-005, "no-show credit-return request queue" (approve/deny). */
export default async function CreditReturnsPage() {
  const requests = await listPendingCreditReturns();

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-navy-950">Credit return requests</h1>
      {requests.length === 0 ? (
        <p className="text-sm text-navy-500">Nothing pending.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="rounded-lg border border-navy-100 p-4 text-sm">
              <p className="font-semibold text-navy-900">{r.buyerEmail}</p>
              <p className="mt-1 text-navy-600">{r.reason}</p>
              <ResolveButtons requestId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
