"use client";

import { useEffect, useState } from "react";
import { getNextStrengthsProbe, recordStrengthsAnswer, type StrengthsProbe } from "@/lib/assessment/session";

export function StrengthsAssessment({ assessmentId, onDone }: { assessmentId: string; onDone: (floorNodeIds: string[]) => void }) {
  const [probe, setProbe] = useState<StrengthsProbe | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean | null; explanation: string } | null>(null);

  async function loadNext() {
    setLoading(true);
    setFeedback(null);
    setSelected("");
    const next = await getNextStrengthsProbe(assessmentId);
    setLoading(false);
    if (!next) return;
    setProbe(next);
    if (next.done) onDone(next.floorNodeIds);
  }

  useEffect(() => {
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  if (loading) return <p className="text-sm text-navy-500">Loading the next question…</p>;
  if (!probe || probe.done) return null;

  async function submit() {
    if (!probe || probe.done) return;
    const result = await recordStrengthsAnswer({
      assessmentId,
      nodeId: probe.nodeId,
      depth: probe.depth,
      questionId: probe.question.id,
      submitted: selected,
    });
    if (!result.ok) return;
    setFeedback({ isCorrect: result.isCorrect, explanation: result.explanation });
  }

  const { question } = probe;

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-5">
      <p className="font-semibold text-navy-950">{question.prompt}</p>

      {question.type === "mcq" && question.choices && (
        <fieldset className="mt-4 space-y-2">
          {question.choices.map((choice) => (
            <label key={choice.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-navy-100 px-4 py-2.5">
              <input type="radio" name="probe" value={choice.id} checked={selected === choice.id} onChange={() => setSelected(choice.id)} />
              {choice.label}
            </label>
          ))}
        </fieldset>
      )}
      {question.type === "numeric" && (
        <input value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-4 w-40 rounded-lg border border-navy-200 px-3 py-2" />
      )}

      {!feedback ? (
        <button
          onClick={submit}
          disabled={selected === ""}
          className="mt-4 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Submit
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className={feedback.isCorrect ? "font-bold text-success" : "font-bold text-error"}>
            {feedback.isCorrect ? "Correct!" : "Not quite."}
          </p>
          <button onClick={loadNext} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
