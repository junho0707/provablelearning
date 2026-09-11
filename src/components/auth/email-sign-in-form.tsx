"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/lib/auth/actions";
import { INPUT } from "@/lib/ui";

const initialState: SignInState = { status: "idle" };

/**
 * Email first, then whichever second step that address needs (F1).
 *
 * The whole form re-posts on step two — the email travels in a hidden field rather than component
 * state, so a password attempt carries the address the server already resolved and the two steps
 * cannot disagree about who is signing in.
 */
export function EmailSignInForm({ redirectTo }: { redirectTo?: string } = {}) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  if (state.status === "sent") {
    return (
      <p className="text-[0.875rem] leading-relaxed text-navy-700">
        Check your email for a sign-in link. You can set a password once you&apos;re in.
      </p>
    );
  }

  const knownEmail = state.status === "password" ? state.email : null;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {redirectTo && <input type="hidden" name="next" value={redirectTo} />}

      {knownEmail ? (
        <>
          <input type="hidden" name="email" value={knownEmail} />
          <p className="text-[0.875rem] text-navy-700">
            Signing in as <strong className="font-semibold text-navy-950">{knownEmail}</strong>
          </p>
          <input
            type="password"
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            placeholder="Your password"
            className={INPUT}
          />
        </>
      ) : (
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={INPUT}
        />
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-navy-950 px-4 py-2.5 text-[0.875rem] font-semibold text-white hover:bg-navy-800 disabled:opacity-40"
      >
        {pending ? "…" : knownEmail ? "Sign in" : "Continue"}
      </button>

      {state.status === "password" && state.message && (
        <p className="text-[0.875rem] text-[var(--error)]">{state.message}</p>
      )}
      {state.status === "error" && (
        <p className="text-[0.875rem] text-[var(--error)]">{state.message}</p>
      )}

      {/* The only way back out of a password: `email_has_password` keeps answering true once one is
          set, so this address reaches the password box every time. `formNoValidate` because it
          posts the form with the password box deliberately left empty. */}
      {knownEmail && (
        <button
          type="submit"
          name="forgot"
          value="1"
          formNoValidate
          disabled={pending}
          className="mt-2 text-center text-[0.875rem] text-navy-950/45 underline hover:text-navy-950 disabled:opacity-40"
        >
          Forgot password? Email me a link
        </button>
      )}
    </form>
  );
}
