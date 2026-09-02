"use client";

import { useState, useTransition } from "react";
import { answerMaterialItem } from "@/lib/sessions/materials";
import type { MaterialItemView } from "@/lib/sessions/materials";

type Outcome = { correct: boolean; explanation: string | null };

/**
 * The practice questions attached to post-session material. Answers are checked on the server —
 * the `answer` column is withheld from the client by a column grant, so there is nothing here to
 * inspect or guess from (migration 0020).
 *
 * Progress is saved as each question is answered, which is what lets the next session pick up from
 * where the student got to rather than starting again.
 */
export function Practice({ items }: { items: MaterialItemView[] }) {
  if (items.length === 0) return null;

  return (
    <section className="mt-10 border-t border-navy-100 pt-8">
      <h2 className="mb-1 text-xl font-bold text-navy-950">Practice</h2>
      <p className="mb-6 text-navy-700">
        Work through these when you&apos;re ready. Your tutor can see how you got on.
      </p>
      <ol className="flex flex-col gap-4">
        {items.map((item, index) => (
          <li key={item.id}>
            <Question item={item} number={index + 1} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Question({ item, number }: { item: MaterialItemView; number: number }) {
  const [answer, setAnswer] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(
    item.answered ? { correct: item.isCorrect ?? false, explanation: item.explanation } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const result = await answerMaterialItem({ itemId: item.id, answer });
      if (!result.ok) return setError(result.message);
      setOutcome({ correct: result.correct, explanation: result.explanation });
    });
  }

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-[var(--shadow-card)]">
      <p className="font-semibold text-navy-950">
        {number}. {item.prompt}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          className="min-w-48 flex-1 rounded-lg border border-navy-200 px-3 py-2 outline-none focus:border-navy-400"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !answer.trim()}
          className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          {outcome ? "Try again" : "Check"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-[var(--error)]">{error}</p>}

      {outcome && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            outcome.correct
              ? "bg-[var(--success-light)] text-[var(--success)]"
              : "bg-[var(--warning-light)] text-[#8a5a00]"
          }`}
        >
          <p className="font-semibold">
            {outcome.correct ? "That's it." : "Not quite — have another go."}
          </p>
          {outcome.explanation && <p className="mt-1 text-navy-800">{outcome.explanation}</p>}
        </div>
      )}
    </div>
  );
}
