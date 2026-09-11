"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setPassword, type SetPasswordState } from "@/lib/auth/actions";
import { INPUT } from "@/lib/ui";

const initialState: SetPasswordState = { status: "idle" };

export function SetPasswordForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(setPassword, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {next && <input type="hidden" name="next" value={next} />}
      <input
        type="password"
        name="password"
        required
        minLength={8}
        autoFocus
        autoComplete="new-password"
        placeholder="At least 8 characters"
        className={INPUT}
      />
      <button
        type="submit"
        disabled={pending}
        className="bg-navy-950 px-4 py-2.5 text-[0.875rem] font-semibold text-white hover:bg-navy-800 disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
      {state.status === "error" && (
        <p className="text-[0.875rem] text-[var(--error)]">{state.message}</p>
      )}
      <Link
        href={next || "/dashboard"}
        className="mt-2 text-center text-[0.875rem] text-navy-950/45 underline hover:text-navy-950"
      >
        Skip for now
      </Link>
    </form>
  );
}
