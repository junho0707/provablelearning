"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuestion, deleteQuestion } from "@/lib/admin/questions";
import type { InternalQuestion } from "@/lib/practice/types";

const inputClass = "w-full rounded-lg border border-navy-200 px-3 py-2 text-sm";

export function QuestionEditor({ lessonSlug, questions }: { lessonSlug: string; questions: InternalQuestion[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<"mcq" | "numeric" | "free">("mcq");
  const [prompt, setPrompt] = useState("");
  const [choicesText, setChoicesText] = useState("a:Option A\nb:Option B");
  const [answer, setAnswer] = useState("");
  const [tolerance, setTolerance] = useState("0");
  const [explanation, setExplanation] = useState("");

  function remove(id: string) {
    startTransition(async () => {
      await deleteQuestion(id);
      router.refresh();
    });
  }

  function create() {
    setError(null);
    const choices =
      type === "mcq"
        ? choicesText
            .split("\n")
            .map((line) => line.split(":"))
            .filter(([id, label]) => id && label)
            .map(([id, label]) => ({ id: id.trim(), label: label.trim() }))
        : null;

    startTransition(async () => {
      const result = await createQuestion({
        lessonSlug,
        position: questions.length,
        type,
        prompt,
        choices,
        answer: type === "free" ? null : answer,
        tolerance: type === "numeric" ? Number(tolerance) : null,
        explanation,
      });
      if (!result.ok) return setError(result.message);
      setPrompt("");
      setAnswer("");
      setExplanation("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {questions.map((q) => (
          <li key={q.id} className="rounded-lg border border-navy-100 p-4 text-sm">
            <p className="font-semibold text-navy-900">
              {q.position}. {q.prompt}
            </p>
            <p className="text-navy-500">
              {q.type} · answer: {q.answer ?? "(free response)"}
            </p>
            <button onClick={() => remove(q.id)} disabled={pending} className="mt-2 text-xs font-semibold text-error underline disabled:opacity-40">
              Delete
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-2 rounded-lg border border-navy-100 p-4">
        <h2 className="text-sm font-bold text-navy-900">Add a question</h2>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={inputClass}>
          <option value="mcq">Multiple choice</option>
          <option value="numeric">Numeric</option>
          <option value="free">Free response</option>
        </select>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt" className={inputClass} rows={2} />
        {type === "mcq" && (
          <textarea
            value={choicesText}
            onChange={(e) => setChoicesText(e.target.value)}
            placeholder="One choice per line: id:label"
            className={inputClass}
            rows={3}
          />
        )}
        {type !== "free" && <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Correct answer" className={inputClass} />}
        {type === "numeric" && (
          <input value={tolerance} onChange={(e) => setTolerance(e.target.value)} placeholder="Tolerance" className={inputClass} />
        )}
        <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explanation" className={inputClass} rows={2} />
        <button onClick={create} disabled={pending} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Add question
        </button>
        {error && (
          <p role="alert" className="text-sm font-medium text-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
