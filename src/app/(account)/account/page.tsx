import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listProfiles } from "@/lib/accounts/profiles";
import { getConsentState } from "@/lib/accounts/consent";
import { courses } from "@/lib/content/roadmap";
import { StudentManager } from "./student-manager";
import { PhoneSetting } from "./phone-setting";
import { RETENTION_DAYS } from "@/lib/policy";
import { BODY, H1, H2 } from "@/lib/ui";

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
    <main className="mx-auto max-w-[1200px] px-6 py-16 sm:px-10">
      <h1 className={H1}>Account</h1>

      <section className="mt-12 border-t border-navy-950/10 pt-10">
        <h2 className={`mb-8 ${H2}`}>Students</h2>
        <StudentManager profiles={profiles} courseOptions={courses()} />
      </section>

      <section className="mt-12 border-t border-navy-950/10 pt-10">
        <h2 className={`mb-3 ${H2}`}>Privacy &amp; consent</h2>
        <div className="max-w-[68ch]">
          <p className={`mb-4 ${BODY}`}>
            Because students can be under 13, the law requires a parent&apos;s permission before we
            collect anything from them directly. Your first purchase is that permission — paying by
            card is how we confirm you&apos;re the adult on the account.
          </p>
          <p className={BODY}>
            Afterwards, each student&apos;s row above has two controls.{" "}
            <strong className="font-semibold text-navy-950">Withdraw consent</strong> closes that
            student&apos;s sign-in and stops any further collection.{" "}
            <strong className="font-semibold text-navy-950">Delete</strong> erases everything we
            hold about them within {RETENTION_DAYS} days.
          </p>
        </div>

        <div className="mt-8 border border-navy-950/10 bg-white p-6">
          {consent.granted ? (
            <p className="text-[0.9375rem] leading-relaxed text-navy-800">
              <strong className="font-semibold text-navy-950">Permission on file</strong> since{" "}
              {new Date(consent.grantedAt!).toLocaleDateString()}, recorded when you completed your
              first purchase. Your students can sign in.
            </p>
          ) : (
            <p className="text-[0.9375rem] leading-relaxed text-navy-800">
              <strong className="font-semibold text-navy-950">No permission on file yet</strong>, so
              no student can sign in — even once you&apos;ve given them a username and password. Your
              first purchase records it and opens their sign-ins straight away.
            </p>
          )}

          {consent.events.length > 0 && (
            <ul className="mt-5 flex flex-col gap-1.5 border-t border-navy-950/10 pt-5 text-[0.875rem] text-navy-950/55">
              {consent.events.map((event, i) => (
                <li key={i}>
                  {new Date(event.at).toLocaleString()} — consent {event.event}
                  {event.mechanism === "stripe_payment" ? " by card payment" : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-12 border-t border-navy-950/10 pt-10">
        <h2 className={`mb-3 ${H2}`}>Contact number</h2>
        <p className={`mb-8 max-w-[68ch] ${BODY}`}>
          We email you a reminder before every session. If you&apos;d rather get it as a text
          message, add a mobile number here — otherwise leave this blank and we&apos;ll stick to
          email.
        </p>
        <PhoneSetting currentPhone={account?.phone ?? null} />
      </section>
    </main>
  );
}
