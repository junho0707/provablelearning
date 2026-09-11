import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { GROUND, H1 } from "@/lib/ui";

export const metadata = { title: "Set a password" };

/**
 * Offered once, straight after a magic-link sign-in (F1). Skipping is allowed — the link still
 * works next time — so this is an upgrade, never a gate.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div style={{ background: GROUND }} className="min-h-screen">
      <main className="mx-auto flex min-h-screen max-w-[26rem] flex-col justify-center gap-8 px-6 py-16 sm:px-10">
        <div>
          <h1 className={H1}>Set a password</h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-navy-700">
            You&apos;re signed in as{" "}
            <strong className="font-semibold text-navy-950">{user.email}</strong>. Set a password and
            next time you can sign in without waiting for an email.
          </p>
        </div>
        <SetPasswordForm next={next} />
      </main>
    </div>
  );
}
