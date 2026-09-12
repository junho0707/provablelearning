import { redirect } from "next/navigation";
import { EmailSignInForm } from "@/components/auth/email-sign-in-form";
import { GoogleButton } from "@/components/auth/google-button";
import { currentBuyerId } from "@/lib/auth/session";
import { GROUND, H1, NOTICE_ERROR } from "@/lib/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  // Already signed in: this page has nothing to offer but a form they would only fill in again.
  const buyerId = await currentBuyerId();
  if (buyerId) redirect(next || "/dashboard");

  return (
    <div style={{ background: GROUND }} className="min-h-screen">
      <main className="mx-auto flex min-h-screen max-w-[26rem] flex-col justify-center gap-8 px-6 py-16 sm:px-10">
        <h1 className={H1}>Sign in</h1>

        {error && (
          <p role="alert" className={NOTICE_ERROR}>
            That sign-in link didn&apos;t work. Links expire — request a new one below.
          </p>
        )}

        <div>
          <GoogleButton redirectTo={next || undefined} />

          <div className="my-5 flex items-center gap-3 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-navy-950/40">
            <div className="h-px flex-1 bg-navy-950/10" />
            or
            <div className="h-px flex-1 bg-navy-950/10" />
          </div>

          <EmailSignInForm redirectTo={next} />
        </div>
      </main>
    </div>
  );
}
