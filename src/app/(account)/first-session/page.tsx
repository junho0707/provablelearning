import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFirstSessionStatus } from "@/lib/assessment/first-session";
import { listProfiles } from "@/lib/accounts/profiles";
import { getOpenAvailability } from "@/lib/booking/availability";
import { FirstSessionFlow } from "./first-session-flow";

export const metadata = { title: "Your first session" };

/** TASK-FIRST-001. Routes a purchased First Session to its mode's pre-session step, or straight to booking (`class_help`). */
export default async function FirstSessionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/first-session");

  const status = await getFirstSessionStatus();
  const profiles = await listProfiles();

  if (!status) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-navy-950">Your first session</h1>
        <p className="mb-6 text-sm text-navy-700">You haven&apos;t purchased a First Session yet.</p>
        <Link href="/sessions" className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white">
          Buy your first session
        </Link>
      </main>
    );
  }

  if (status.booked) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-navy-950">You&apos;re all set</h1>
        <p className="text-sm text-navy-700">
          Your first session is booked. Check <Link href="/sessions" className="underline">your sessions</Link> for the details.
        </p>
      </main>
    );
  }

  const slots = await getOpenAvailability();

  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-navy-950">Your first session</h1>
      <FirstSessionFlow
        purchaseId={status.purchaseId}
        goal={status.goal}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
        slots={slots}
      />
    </main>
  );
}
