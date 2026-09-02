"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendMessage } from "@/lib/messages/thread";

export function Composer() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const result = await sendMessage(body);
      if (!result.ok) return setError(result.message);
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="mt-8 flex flex-col gap-3">
      <textarea
        className="min-h-28 w-full rounded-lg border border-navy-200 px-3 py-2.5 text-navy-950 outline-none focus:border-navy-400"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        placeholder="Write to your tutor…"
      />
      {error && (
        <p role="alert" className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
          {error}
        </p>
      )}
      <div>
        <button
          type="button"
          onClick={send}
          disabled={pending || body.trim().length === 0}
          className="rounded-lg bg-navy-900 px-6 py-3 font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
