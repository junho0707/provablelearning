"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDiagnosticQuestion,
  deleteDiagnosticQuestion,
  setDiagnosticPublished,
} from "@/lib/admin/diagnostics";

const inputClass = "w-full rounded-lg border border-navy-200 px-3 py-2 text-sm";

type Row = {
  id: string;
  position: number;
  type: "mcq" | "numeric" | "free";
  prompt: string;
  answer: string | null;
};

export function QuestionEditor({
  diagnosticId,
  published,
  questions,
}: {
  diagnosticId: string;
  published: boolean;
  questions: Row[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<"mcq" | "numeric" | "free">("mcq");
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState("");
  const [answer, setAnswer] = useState("");
  const [tolerance, setTolerance] = useState("");
  const [explanation, setExplanation] = useState("");

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addDiagnosticQuestion({
        diagnosticId,
        type,
        prompt,
        choices,
        answer,
        tolerance: tolerance ? Number(tolerance) : null,
        explanation,
      });
      if (!result.ok) return setError(result.message);
      setPrompt("");
      setChoices("");
      setAnswer("");
      setTolerance("");
      setExplanation("");
      router.refresh();
    });
  }

  function remove(questionId: string) {
    startTransition(async () => {
      await deleteDiagnosticQuestion(questionId);
      router.refresh();
    });
  }

  function togglePublished() {
    setError(null);
    startTransition(async () => {
      const result = await setDiagnosticPublished(diagnosticId, !published);
      if (!result.ok) return setError(result.message);
      router.refresh();
    });
  }

  return (
    <div className="mt-8 space-y-8">
      <div>
        <h2 className="mb-2 text-sm font-bold text-navy-900">Questions</h2>
        {questions.length === 0 ? (
          <p className="text-sm text-navy-500">None yet.</p>
        ) : (
          <ol className="space-y-2">
            {questions.map((question) => (
              <li
                key={question.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-navy-100 p-3 text-sm"
              >
                <div>
                  <p className="text-navy-900">
                    {question.position + 1}. {question.prompt}
                  </p>
                  <p className="mt-0.5 text-xs text-navy-500">
                    {question.type}
                    {question.answer ? ` · answer: ${question.answer}` : " · not auto-graded"}
                  </p>
                </div>
                <button
                  onClick={() => remove(question.id)}
                  disabled={pending}
                  className="shrink-0 text-xs font-semibold text-[var(--error)] underline disabled:opacity-40"
                >
                  Delete
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold text-navy-900">Add a question</h2>
        <div className="space-y-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "mcq" | "numeric" | "free")}
            className={inputClass}
          >
            <option value="mcq">Multiple choice</option>
            <option value="numeric">Numeric</option>
            <option value="free">Free response (not graded)</option>
          </select>

          <textarea
            className={`${inputClass} min-h-20`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="The question"
          />

          {type === "mcq" && (
            <textarea
              className={`${inputClass} min-h-20`}
              value={choices}
              onChange={(e) => setChoices(e.target.value)}
              placeholder={"One option per line. They become a, b, c…"}
            />
          )}

          {type !== "free" && (
            <div className="flex flex-wrap gap-2">
              <input
                className={`${inputClass} max-w-48`}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={type === "mcq" ? "Correct letter" : "Correct number"}
              />
              {type === "numeric" && (
                <input
                  className={`${inputClass} max-w-48`}
                  value={tolerance}
                  onChange={(e) => setTolerance(e.target.value)}
                  placeholder="Tolerance (optional)"
                />
              )}
            </div>
          )}

          <textarea
            className={`${inputClass} min-h-20`}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Worked explanation — for you and for post-session material, never shown mid-diagnostic"
          />

          <button
            disabled={pending || !prompt.trim() || !explanation.trim()}
            onClick={add}
            className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Add question
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--error)]">
          {error}
        </p>
      )}

      <div className="border-t border-navy-100 pt-6">
        <button
          disabled={pending}
          onClick={togglePublished}
          className="rounded-lg border border-navy-200 px-4 py-2 text-sm font-semibold text-navy-800 hover:border-navy-400 disabled:opacity-40"
        >
          {published ? "Withdraw" : "Publish"}
        </button>
        <p className="mt-2 text-xs text-navy-500">
          Withdrawing stops it being served without deleting answers students have already given.
        </p>
      </div>
    </div>
  );
}
