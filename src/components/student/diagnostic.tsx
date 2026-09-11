"use client";

import { useState, useTransition } from "react";
import { answerDiagnosticQuestion } from "@/lib/assessment/diagnostics";
import type { PreSessionView } from "@/lib/sessions/student";
import { BTN_SECONDARY, H3, INPUT, NOTICE_ERROR } from "@/lib/ui";

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
        <h2 className={H3}>{diagnostic.name}</h2>
        <p className="mt-1 text-[0.875rem] text-navy-950/55">
          {answered} of {diagnostic.questions.length} answered. You can stop at any point.
        </p>
      </div>

      <div className="border-t border-navy-950/10">
        {diagnostic.questions.map((question, index) => (
          <div key={question.id} className="border-b border-navy-950/10 py-6">
            <p className="text-[0.9375rem] font-semibold text-navy-950">
              {index + 1}. {question.prompt}
            </p>

            <div className="mt-4">
              {question.type === "mcq" && question.choices ? (
                <div className="flex flex-col gap-2">
                  {question.choices.map((choice) => (
                    <label
                      key={choice.id}
                      className="flex items-center gap-2.5 text-[0.9375rem] text-navy-800"
                    >
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
                  className={INPUT}
                  value={answers[question.id] ?? ""}
                  onChange={(e) =>
                    setAnswers((previous) => ({ ...previous, [question.id]: e.target.value }))
                  }
                  placeholder={question.type === "numeric" ? "Your answer, as a number" : "Your answer"}
                />
              )}
            </div>

            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                onClick={() => submit(question.id)}
                disabled={pending || !(answers[question.id] ?? "").trim()}
                className={BTN_SECONDARY}
              >
                {saved.has(question.id) ? "Update" : "Answer"}
              </button>
              {saved.has(question.id) && (
                <span className="text-[0.875rem] text-navy-950/45">Saved</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className={NOTICE_ERROR}>
          {error}
        </p>
      )}
    </section>
  );
}
