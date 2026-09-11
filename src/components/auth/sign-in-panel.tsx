"use client";

import { useState } from "react";
import Link from "next/link";
import { GoogleButton } from "./google-button";
import { EmailSignInForm } from "./email-sign-in-form";
import { StudentLoginForm } from "./student-login-form";

/**
 * The sign-in options, as plain content. It paints no backdrop and traps nothing — the caller
 * decides where it sits (a panel under the nav button, or revealed under a CTA), and the rest of
 * the page stays readable and clickable the whole time.
 *
 * Two kinds of account sign in in different ways and cannot share one form: a parent has an email
 * identity (Google or a magic link), a student has only the username and password their parent set
 * up, and no email ever reaches a student (INV-AUTH-2). The switch is therefore between two
 * separate forms, not two ways into one.
 */
export function SignInPanel({
  redirectTo,
  onSuccess,
}: {
  /** Where to send a parent after a successful sign-in. Students always land on `/student`. */
  redirectTo?: string;
  onSuccess?: () => void;
}) {
  const [who, setWho] = useState<"parent" | "student">("parent");

  return (
    <div className="text-left">
      {/* Segmented switch. `aria-pressed` rather than a tablist: these swap which form is shown,
          and each form is a landmark in its own right. Selection is a fill, not a raised tile —
          the same way the slot picker and the topic toggle mark a choice. */}
      <div className="mb-5 grid grid-cols-2">
        {(["parent", "student"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setWho(kind)}
            aria-pressed={who === kind}
            className={`border px-3 py-2 text-[0.875rem] font-semibold capitalize ${
              who === kind
                ? "border-navy-950 bg-navy-950 text-white"
                : "border-navy-950/15 text-navy-700 hover:border-navy-950"
            }`}
          >
            {kind}
          </button>
        ))}
      </div>

      {who === "parent" ? (
        <>
          <GoogleButton onSuccess={onSuccess} redirectTo={redirectTo} />
          <div className="my-5 flex items-center gap-3 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-navy-950/40">
            <div className="h-px flex-1 bg-navy-950/10" />
            or
            <div className="h-px flex-1 bg-navy-950/10" />
          </div>
          <EmailSignInForm redirectTo={redirectTo} />
        </>
      ) : (
        <>
          <p className="mb-4 text-[0.875rem] leading-relaxed text-navy-700">
            Use the username and password your parent set up for you.
          </p>
          <StudentLoginForm />
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-navy-950/55">
            No account yet? A parent creates it from their{" "}
            <Link href="/account" className="underline hover:text-navy-950">
              account page
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
