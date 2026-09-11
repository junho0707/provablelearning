"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendMessage } from "@/lib/messages/thread";
import { BTN_LG, INPUT, NOTICE_ERROR } from "@/lib/ui";

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
    <div className="mt-10 border-t border-navy-950/10 pt-8">
      <div className="flex flex-col gap-4">
        <textarea
          className={`${INPUT} min-h-28`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          placeholder="Write to your tutor…"
        />
        {error && (
          <p role="alert" className={NOTICE_ERROR}>
            {error}
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={send}
            disabled={pending || body.trim().length === 0}
            className={BTN_LG}
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
