import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { GoogleButton } from "@/components/auth/google-button";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-6 px-5 py-16">
      <h1 className="text-2xl font-extrabold tracking-tight text-navy-950">Sign in</h1>

      <GoogleButton />

      <div className="flex items-center gap-3 text-xs font-semibold text-navy-400">
        <div className="h-px flex-1 bg-navy-100" />
        or
        <div className="h-px flex-1 bg-navy-100" />
      </div>

      <MagicLinkForm />
    </main>
  );
}
