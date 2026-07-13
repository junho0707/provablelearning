"use client";

import { useState } from "react";
import { checkAnswer } from "@/lib/practice/actions";
import type { CheckResult, PublicQuestion } from "@/lib/practice/types";

/** Practice section rendered under a lesson's prose. Anonymous — no login, nothing saved (M1). */
export function PracticeQuestions({ questions }: { questions: PublicQuestion[] }) {
  if (questions.length === 0) return null;

  return (
    <section className="mt-16 border-t border-navy-100 pt-10" aria-labelledby="practice-heading">
      <h2 id="practice-heading" className="text-2xl font-bold text-navy-950">
        Practice
      </h2>
      <p className="mt-1 text-sm text-navy-600">
        Try these to check your understanding. Nothing is saved — practice as many times as you like.
      </p>
      <ol className="mt-8 space-y-8">
        {questions.map((q, i) => (
          <li key={q.id}>
            <QuestionCard question={q} index={i + 1} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function QuestionCard({ question, index }: { question: PublicQuestion; index: number }) {
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isReveal = question.type === "free";

  async function submit(value: string) {
    setPending(true);
    setError(null);
    const res = await checkAnswer({ questionId: question.id, submitted: value });
    setPending(false);
    if (res.ok) {
      setResult({ isCorrect: res.isCorrect, explanation: res.explanation });
    } else {
      setError(res.message);
      setResult(null);
    }
  }

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-[var(--shadow-card)]">
      <p className="font-semibold text-navy-950">
        <span className="mr-2 text-navy-400">{index}.</span>
        {question.prompt}
      </p>

      <div className="mt-4">
        {question.type === "mcq" && question.choices && (
          <fieldset className="space-y-2">
            <legend className="sr-only">{question.prompt}</legend>
            {question.choices.map((choice) => (
              <label
                key={choice.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-navy-100 px-4 py-2.5 text-navy-800 has-[:checked]:border-navy-400 has-[:checked]:bg-navy-50"
              >
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  value={choice.id}
                  checked={selected === choice.id}
                  onChange={() => setSelected(choice.id)}
                />
                {choice.label}
              </label>
            ))}
          </fieldset>
        )}

        {question.type === "numeric" && (
          <input
            type="text"
            inputMode="decimal"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            placeholder="Your answer"
            aria-label="Your numeric answer"
            className="w-40 rounded-lg border border-navy-200 px-3 py-2 text-navy-900 focus:border-navy-400"
          />
        )}

        {question.type === "free" && (
          <textarea
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            placeholder="Work through it here, then reveal the solution to check yourself."
            rows={3}
            aria-label="Your working"
            className="w-full rounded-lg border border-navy-200 px-3 py-2 text-navy-900 focus:border-navy-400"
          />
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => submit(selected)}
          disabled={pending || (!isReveal && selected === "")}
          className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-40"
        >
          {isReveal ? "Reveal solution" : "Check answer"}
        </button>
        {error && (
          <span role="alert" className="text-sm font-medium text-error">
            {error}
          </span>
        )}
      </div>

      {result && (
        <div
          aria-live="polite"
          className="mt-4 rounded-lg border p-4 text-sm"
          style={resultStyle(result.isCorrect)}
        >
          {result.isCorrect === true && <p className="font-bold text-success">Correct!</p>}
          {result.isCorrect === false && (
            <p className="font-bold text-error">Not quite — here&apos;s why:</p>
          )}
          {result.isCorrect === null && (
            <p className="font-bold text-navy-900">Worked solution</p>
          )}
          <p className="mt-1 text-navy-800">{result.explanation}</p>
          {result.isCorrect === null && (
            <p className="mt-2 text-navy-500">Compare it with your own work and assess yourself.</p>
          )}
        </div>
      )}
    </div>
  );
}

function resultStyle(isCorrect: boolean | null): React.CSSProperties {
  if (isCorrect === true) return { borderColor: "var(--success)", background: "var(--success-light)" };
  if (isCorrect === false) return { borderColor: "var(--error)", background: "var(--error-light)" };
  return { borderColor: "var(--navy-200)", background: "var(--navy-50)" };
}
