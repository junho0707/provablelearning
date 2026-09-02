"use client";

import { useEffect, useState } from "react";
import { getTestPrepQuestions, checkTestPrepAnswer } from "@/lib/assessment/test-prep";
import { completeTestPrepAssessment } from "@/lib/assessment/session";
import type { PublicQuestion } from "@/lib/practice/types";

export function TestPrepFlow({ assessmentId, testSlug, onDone }: { assessmentId: string; testSlug: string; onDone: () => void }) {
  const [questions, setQuestions] = useState<PublicQuestion[] | null>(null);

  useEffect(() => {
    getTestPrepQuestions(testSlug).then(setQuestions);
  }, [testSlug]);

  if (!questions) return <p className="text-sm text-navy-500">Loading…</p>;
  if (questions.length === 0) {
    return (
      <div>
        <p className="text-sm text-navy-600">This test-prep set isn&apos;t authored yet.</p>
        <button
          onClick={async () => {
            await completeTestPrepAssessment(assessmentId);
            onDone();
          }}
          className="mt-4 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Continue to booking
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {questions.map((q, i) => (
        <TestPrepQuestion key={q.id} question={q} index={i + 1} />
      ))}
      <button
        onClick={async () => {
          await completeTestPrepAssessment(assessmentId);
          onDone();
        }}
        className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white"
      >
        I&apos;m done — continue to booking
      </button>
    </div>
  );
}

function TestPrepQuestion({ question, index }: { question: PublicQuestion; index: number }) {
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<{ isCorrect: boolean | null; explanation: string } | null>(null);

  async function submit() {
    const res = await checkTestPrepAnswer({ questionId: question.id, submitted: selected });
    if (res.ok) setFeedback({ isCorrect: res.isCorrect, explanation: res.explanation });
  }

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-5">
      <p className="font-semibold text-navy-950">
        {index}. {question.prompt}
      </p>
      {question.type === "mcq" && question.choices && (
        <fieldset className="mt-4 space-y-2">
          {question.choices.map((choice) => (
            <label key={choice.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-navy-100 px-4 py-2.5">
              <input type="radio" name={`tp-${question.id}`} value={choice.id} checked={selected === choice.id} onChange={() => setSelected(choice.id)} />
              {choice.label}
            </label>
          ))}
        </fieldset>
      )}
      {question.type === "numeric" && (
        <input value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-4 w-40 rounded-lg border border-navy-200 px-3 py-2" />
      )}
      {!feedback ? (
        <button onClick={submit} disabled={selected === ""} className="mt-3 text-sm font-semibold text-navy-700 underline disabled:opacity-40">
          Check
        </button>
      ) : (
        <p className={`mt-3 text-sm ${feedback.isCorrect ? "text-success" : "text-error"}`}>{feedback.explanation}</p>
      )}
    </div>
  );
}
