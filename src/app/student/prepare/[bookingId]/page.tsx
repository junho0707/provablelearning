import Link from "next/link";
import { notFound } from "next/navigation";
import { getPreSession } from "@/lib/sessions/student";
import { PrepareForm } from "./prepare-form";

export const metadata = { title: "Before your session" };

export default async function PreparePage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const view = await getPreSession(bookingId);
  if (!view) notFound();

  const startsAt = new Date(view.session.startsAt).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <main className="mx-auto max-w-[720px] px-5 py-12">
      <Link href="/student" className="text-sm font-semibold text-navy-600 hover:text-navy-900">
        ← Back
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-navy-950">
        {view.shape.title}
      </h1>
      <p className="mt-2 text-navy-700">{view.shape.blurb}</p>
      <p className="mt-1 text-sm text-navy-600">Your session is {startsAt}.</p>

      {/* F6 step 4: never blocking. The student is told the cost of skipping, not stopped. */}
      <p className="mt-6 rounded-lg border border-navy-100 bg-white px-4 py-3 text-sm text-navy-700">
        You don&apos;t have to fill this in — but the session works much better when your tutor knows
        what to prepare.
      </p>

      <div className="mt-8">
        <PrepareForm view={view} />
      </div>
    </main>
  );
}
