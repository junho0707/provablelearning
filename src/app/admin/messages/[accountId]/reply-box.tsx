"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyToThread } from "@/lib/messages/thread";

export function ReplyBox({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const result = await replyToThread(accountId, body);
      if (!result.ok) return setError(result.message);
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <textarea
        className="min-h-24 w-full rounded-lg border border-navy-200 px-3 py-2.5 text-sm text-navy-950 outline-none focus:border-navy-400"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        placeholder="Reply…"
      />
      {error && (
        <p role="alert" className="text-sm text-[var(--error)]">
          {error}
        </p>
      )}
      <div>
        <button
          type="button"
          onClick={send}
          disabled={pending || body.trim().length === 0}
          className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Reply"}
        </button>
      </div>
    </div>
  );
}
