import { notFound } from "next/navigation";
import { getBookingPlan } from "@/lib/admin/plans";
import { NotesForm } from "./notes-form";

export const metadata = { title: "Admin — session plan" };

/** TASK-FIRST-002. The written plan, assembled from assessment results and/or session notes. */
export default async function BookingPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await getBookingPlan(id);
  if (!plan) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-navy-950">Session plan</h1>

      <NotesForm bookingId={id} currentNotes={plan.sessionNotes ?? ""} />

      <div className="mt-8 rounded-lg border border-navy-100 bg-navy-50 p-4">
        <h2 className="mb-2 text-sm font-bold text-navy-900">Plan preview</h2>
        <pre className="whitespace-pre-wrap text-sm text-navy-800">{plan.planText}</pre>
      </div>
      <p className="mt-4 text-xs text-navy-500">
        Deliver this to the buyer within 48 hours of the session (a copy commitment, not automated).
      </p>
    </div>
  );
}
