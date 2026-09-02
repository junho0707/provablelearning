"use client";

import { useActionState } from "react";
import { sendMagicLink, type MagicLinkState } from "@/lib/auth/actions";

const initialState: MagicLinkState = { status: "idle" };

export function MagicLinkForm({ redirectTo }: { redirectTo?: string } = {}) {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);

  if (state.status === "sent") {
    return <p className="text-sm text-navy-700">Check your email for a sign-in link.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {redirectTo && <input type="hidden" name="next" value={redirectTo} />}
      <input
        type="email"
        name="email"
        required
        placeholder="you@example.com"
        className="rounded-lg border border-navy-200 px-3 py-2.5 text-sm outline-none focus:border-navy-400"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send sign-in link to my email"}
      </button>
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
    </form>
  );
}
