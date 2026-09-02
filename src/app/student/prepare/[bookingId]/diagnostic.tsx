"use client";

import { useState, useTransition } from "react";
import { answerDiagnosticQuestion } from "@/lib/assessment/diagnostics";
import type { PreSessionView } from "@/lib/sessions/student";

const inputClass =
  "w-full rounded-lg border border-navy-200 px-3 py-2.5 text-navy-950 outline-none focus:border-navy-400";

type Diagnostic = NonNullable<PreSessionView["diagnostic"]>;

/**
 * The diagnostic (F6, AT-PRE-3/4). Correctness is never shown: the blurb promises "no grade", and
 * telling a student they got one wrong changes how they answer the next. The result goes to the
 * tutor, who opens the session with it.
 *
 * Answers save one at a time, so a student who stops halfway has still told the tutor something.
 */
export function DiagnosticQuestions({
  bookingId,
  diagnostic,
}: {
  bookingId: string;
  diagnostic: Diagnostic;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(diagnostic.questions.map((q) => [q.id, q.submitted ?? ""])),
  );
  const [saved, setSaved] = useState<Set<string>>(
    new Set(diagnostic.questions.filter((q) => q.submitted !== null).map((q) => q.id)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(questionId: string) {
    setError(null);
    start(async () => {
      const result = await answerDiagnosticQuestion({
        bookingId,
        questionId,
        submitted: answers[questionId] ?? "",
      });
      if (!result.ok) return setError(result.message);
      setSaved((previous) => new Set(previous).add(questionId));
    });
  }

  const answered = diagnostic.questions.filter((q) => saved.has(q.id)).length;

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-bold text-navy-950">{diagnostic.name}</h2>
        <p className="text-sm text-navy-600">
          {answered} of {diagnostic.questions.length} answered. You can stop at any point.
        </p>
      </div>

      {diagnostic.questions.map((question, index) => (
        <div key={question.id} className="rounded-lg border border-navy-100 bg-white p-4">
          <p className="font-semibold text-navy-900">
            {index + 1}. {question.prompt}
          </p>

          <div className="mt-3">
            {question.type === "mcq" && question.choices ? (
              <div className="flex flex-col gap-2">
                {question.choices.map((choice) => (
                  <label key={choice.id} className="flex items-center gap-2 text-sm text-navy-800">
                    <input
                      type="radio"
                      name={question.id}
                      value={choice.id}
                      checked={answers[question.id] === choice.id}
                      onChange={(e) =>
                        setAnswers((previous) => ({ ...previous, [question.id]: e.target.value }))
                      }
                    />
                    {choice.label}
                  </label>
                ))}
              </div>
            ) : (
              <input
                className={inputClass}
                value={answers[question.id] ?? ""}
                onChange={(e) =>
                  setAnswers((previous) => ({ ...previous, [question.id]: e.target.value }))
                }
                placeholder={question.type === "numeric" ? "Your answer, as a number" : "Your answer"}
              />
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => submit(question.id)}
              disabled={pending || !(answers[question.id] ?? "").trim()}
              className="rounded-lg border border-navy-200 px-4 py-2 text-sm font-semibold text-navy-800 hover:border-navy-400 disabled:opacity-60"
            >
              {saved.has(question.id) ? "Update" : "Answer"}
            </button>
            {saved.has(question.id) && <span className="text-sm text-navy-500">Saved</span>}
          </div>
        </div>
      ))}

      {error && (
        <p role="alert" className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
          {error}
        </p>
      )}
    </section>
  );
}
