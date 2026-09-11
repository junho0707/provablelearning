"use client";

import { useActionState } from "react";
import { signInStudent, type StudentSignInState } from "@/lib/auth/student";
import { INPUT, LABEL, NOTICE_ERROR } from "@/lib/ui";

const INITIAL: StudentSignInState = { status: "idle" };

export function StudentLoginForm() {
  const [state, action, pending] = useActionState(signInStudent, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className={LABEL}>Username</span>
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className={LABEL}>Password</span>
        <input name="password" type="password" autoComplete="current-password" required className={INPUT} />
      </label>

      {state.status === "error" && (
        <p role="alert" className={NOTICE_ERROR}>
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-navy-950 px-4 py-3 text-[0.9375rem] font-semibold text-white hover:bg-navy-800 disabled:opacity-40"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      {/* There is no reset link on purpose: a student's password is reset by their parent
          (INV-AUTH-1), and no email can reach a student to carry a reset anyway (INV-AUTH-2). */}
      <p className="text-[0.875rem] leading-relaxed text-navy-700">
        Forgot your password? Ask the parent who set up your account — they can change it for you.
      </p>
    </form>
  );
}
