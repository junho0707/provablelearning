import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listProfiles } from "@/lib/accounts/profiles";
import { getActiveProfileId } from "@/lib/accounts/active-profile";
import { courses } from "@/lib/content/roadmap";
import { ProfileManager } from "./profile-manager";
import { PhoneSetting } from "./phone-setting";

export const metadata = { title: "Account" };

/** Learner profiles and contact details. Billing lives on `/credits`, next to the buy flow. */
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  const [profiles, activeId, { data: account }] = await Promise.all([
    listProfiles(),
    getActiveProfileId(),
    supabase.from("accounts").select("phone").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <main>
      <section className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8">
        <h1 className="mb-12 text-3xl font-extrabold tracking-[-0.01em] text-navy-950 sm:text-4xl">
          Account
        </h1>

        <div className="mb-12">
          <h2 className="mb-2 text-2xl font-bold tracking-[-0.01em] text-navy-950">
            Learner profiles
          </h2>
          <p className="mb-8 text-navy-600">Add who&apos;s learning — you, your kid, or both.</p>
          <ProfileManager profiles={profiles} activeId={activeId} courseOptions={courses()} />
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
