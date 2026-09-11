"use client";

import { useActionState } from "react";
import { submitContactMessage, type ContactState } from "@/lib/contact-action";

const initialState: ContactState = { status: "idle" };

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContactMessage, initialState);

  if (state.status === "sent") {
    return <p className="text-[0.9375rem] text-white/80">Sent — we&apos;ll get back to you.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Off-screen, not `display:none` — a screen reader would otherwise announce a field a
          sighted bot can still see and fill, while a real bot's DOM scrape fills it regardless. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0"
      />
      <input
        type="email"
        name="email"
        required
        placeholder="Your email"
        className="border border-navy-950/15 bg-white px-4 py-3 text-[0.9375rem] text-navy-950 outline-none placeholder:text-navy-950/45 focus:border-navy-950/40"
      />
      <textarea
        name="message"
        required
        rows={4}
        placeholder="What's your question?"
        className="border border-navy-950/15 bg-white px-4 py-3 text-[0.9375rem] text-navy-950 outline-none placeholder:text-navy-950/45 focus:border-navy-950/40"
      />
      <button
        type="submit"
        disabled={pending}
        className="self-start bg-white px-6 py-3 text-[0.9375rem] font-semibold text-navy-950 hover:bg-navy-100 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send"}
      </button>
      {state.status === "error" && <p className="text-[0.875rem] text-red-300">{state.message}</p>}
    </form>
  );
}
