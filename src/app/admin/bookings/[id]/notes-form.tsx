"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSessionNotes } from "@/lib/admin/plans";

export function NotesForm({ bookingId, currentNotes }: { bookingId: string; currentNotes: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState(currentNotes);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(false);
    startTransition(async () => {
      const result = await setSessionNotes(bookingId, notes);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <h2 className="mb-2 text-sm font-bold text-navy-900">Session notes</h2>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
        placeholder="What happened in the session, where the learner is strong, what to work on next…"
      />
      <button onClick={save} disabled={pending} className="mt-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        Save notes
      </button>
      {saved && <span className="ml-3 text-sm text-success">Saved.</span>}
    </div>
  );
}
