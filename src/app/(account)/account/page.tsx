import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listProfiles } from "@/lib/accounts/profiles";
import { getConsentState } from "@/lib/accounts/consent";
import { courses } from "@/lib/content/roadmap";
import { StudentManager } from "./student-manager";
import { PhoneSetting } from "./phone-setting";
import { RETENTION_DAYS } from "@/lib/policy";

export const metadata = { title: "Account" };

/** Students, contact details, and the parental consent record. Billing lives on `/credits`. */
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const [profiles, consent, { data: account }] = await Promise.all([
    listProfiles(),
    getConsentState(),
    supabase.from("accounts").select("phone").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <main>
      <section className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
        <h1 className="mb-12 text-3xl font-extrabold tracking-[-0.01em] text-navy-950 sm:text-4xl">
          Account
        </h1>

        <div className="mb-12">
          <h2 className="mb-2 text-2xl font-bold tracking-[-0.01em] text-navy-950">Students</h2>
          <p className="mb-8 text-navy-600">
            Add who&apos;s learning — you, your kid, or both. Each student gets their own sign-in for
            session prep and materials. They can never see billing or book a session.
          </p>
          <StudentManager profiles={profiles} courseOptions={courses()} />
        </div>

        <div className="mb-12 border-t border-navy-100 pt-10">
          <h2 className="mb-2 text-2xl font-bold tracking-[-0.01em] text-navy-950">
            Privacy &amp; consent
          </h2>
          <p className="mb-6 text-navy-600">
            You control what we hold about each student. Withdrawing consent turns off their sign-in
            and stops any further collection; deleting removes everything within {RETENTION_DAYS}{" "}
            days. Both are on each student&apos;s row above.
          </p>

          <div className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]">
            {consent.granted ? (
              <p className="text-navy-800">
                Consent on file since{" "}
                <strong>{new Date(consent.grantedAt!).toLocaleDateString()}</strong>, given when you
                completed your first purchase.
              </p>
            ) : (
              <p className="text-navy-800">
                No consent recorded yet. Student sign-ins stay closed until your first purchase,
                which is what records it.
              </p>
            )}

            {consent.events.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1.5 border-t border-navy-100 pt-4 text-sm text-navy-600">
                {consent.events.map((event, i) => (
                  <li key={i}>
                    {new Date(event.at).toLocaleString()} — consent {event.event}
                    {event.mechanism === "stripe_payment" ? " by card payment" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-navy-100 pt-10">
          <h2 className="mb-2 text-2xl font-bold tracking-[-0.01em] text-navy-950">
            Contact number
          </h2>
          <p className="mb-8 text-navy-600">
            Session reminders go to your email. Add a number only if you&apos;d rather get them by
            text.
          </p>
          <PhoneSetting currentPhone={account?.phone ?? null} />
        </div>
      </section>
    </main>
  );
}
