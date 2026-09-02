"use client";

import { useActionState } from "react";
import { signInStudent, type StudentSignInState } from "@/lib/auth/student";

const INITIAL: StudentSignInState = { status: "idle" };

export function StudentLoginForm() {
  const [state, action, pending] = useActionState(signInStudent, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-navy-900">Username</span>
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="rounded-lg border border-navy-200 px-3 py-2.5 text-navy-950 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-navy-900">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-navy-200 px-3 py-2.5 text-navy-950 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
        />
      </label>

      {state.status === "error" && (
        <p role="alert" className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-navy-900 px-4 py-3 font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      {/* There is no reset link on purpose: a student's password is reset by their parent
          (INV-AUTH-1), and no email can reach a student to carry a reset anyway (INV-AUTH-2). */}
      <p className="text-sm text-navy-600">
        Forgot your password? Ask the parent who set up your account — they can change it for you.
      </p>
    </form>
  );
}
