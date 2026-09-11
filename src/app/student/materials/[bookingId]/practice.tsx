"use client";

import { useState, useTransition } from "react";
import { answerMaterialItem } from "@/lib/sessions/materials";
import type { MaterialItemView } from "@/lib/sessions/materials";
import { BTN, H2, INPUT } from "@/lib/ui";

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
    <section className="mt-10 border-t border-navy-950/10 pt-8">
      <h2 className={`mb-2 ${H2}`}>Practice</h2>
      <p className="mb-8 text-[0.9375rem] leading-relaxed text-navy-700">
        Work through these when you&apos;re ready. Your tutor can see how you got on.
      </p>
      <ol className="border-t border-navy-950/10">
        {items.map((item, index) => (
          <li key={item.id} className="border-b border-navy-950/10 py-6">
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
    <div>
      <p className="text-[0.9375rem] font-semibold text-navy-950">
        {number}. {item.prompt}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          className={`${INPUT} min-w-48 flex-1`}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button type="button" onClick={submit} disabled={pending || !answer.trim()} className={BTN}>
          {outcome ? "Try again" : "Check"}
        </button>
      </div>

      {error && <p className="mt-3 text-[0.875rem] text-[var(--error)]">{error}</p>}

      {outcome && (
        <div
          className={`mt-4 border-l-2 px-4 py-3 text-[0.875rem] ${
            outcome.correct
              ? "border-[var(--success)] bg-[var(--success-light)] text-[var(--success)]"
              : "border-[var(--warning)] bg-[var(--warning-light)] text-[#8a5a00]"
          }`}
        >
          <p className="font-semibold">
            {outcome.correct ? "That's it." : "Not quite — have another go."}
          </p>
          {outcome.explanation && (
            <p className="mt-1.5 leading-relaxed text-navy-800">{outcome.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}
