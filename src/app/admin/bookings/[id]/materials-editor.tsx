"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMaterial, type MaterialDraft } from "@/lib/sessions/materials";
import { MATERIALS_DUE_HOURS } from "@/lib/policy";

const inputClass =
  "w-full rounded-lg border border-navy-200 px-3 py-2 text-sm outline-none focus:border-navy-400";

type Item = { prompt: string; answer: string; explanation: string };

/**
 * Authoring post-session material (F8). Hand-written, not generated (ADR-007 §9) — the tutor
 * writes the whole thing here and publishes when it is ready.
 *
 * Draft and publish are separate actions on purpose: RLS shows a student only published material,
 * so saving a half-finished draft is safe and the student sees nothing until it is finished.
 */
export function MaterialsEditor({ bookingId, draft }: { bookingId: string; draft: MaterialDraft }) {
  const router = useRouter();
  const [summary, setSummary] = useState(draft.summary);
  const [roadmap, setRoadmap] = useState(draft.roadmap);
  const [explanations, setExplanations] = useState(draft.explanations);
  const [items, setItems] = useState<Item[]>(
    draft.items.map((i) => ({ prompt: i.prompt, answer: i.answer, explanation: i.explanation ?? "" })),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function update(index: number, patch: Partial<Item>) {
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function save(publish: boolean) {
    setError(null);
    setMessage(null);
    start(async () => {
      const result = await saveMaterial({
        bookingId,
        summary,
        roadmap,
        explanations,
        items: items
          .filter((i) => i.prompt.trim() && i.answer.trim())
          .map((i) => ({ prompt: i.prompt, answer: i.answer, explanation: i.explanation || null })),
        publish,
      });
      if (!result.ok) return setError(result.message);
      setMessage(result.published ? "Published — the student can see it now." : "Draft saved.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-navy-950">Materials</h2>
        {draft.publishedAt ? (
          <span className="rounded bg-[var(--success-light)] px-2 py-0.5 text-xs font-semibold text-[var(--success)]">
            Published {new Date(draft.publishedAt).toLocaleDateString()}
          </span>
        ) : (
          <span className="rounded bg-[var(--warning-light)] px-2 py-0.5 text-xs font-semibold text-[#8a5a00]">
            Not published · due within {MATERIALS_DUE_HOURS}h
          </span>
        )}
      </div>

      {/* Copy rule: strengths and next steps, never deficits (system/00-BUSINESS.md §7). */}
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-navy-900">Where they&apos;re at</span>
        <textarea
          className={`${inputClass} min-h-28`}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What they can do now, and what's clicking. Strengths and next steps — never deficits."
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-navy-900">Next steps</span>
        <textarea
          className={`${inputClass} min-h-28`}
          value={roadmap}
          onChange={(e) => setRoadmap(e.target.value)}
          placeholder="What to learn next, in order."
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-navy-900">Explanations</span>
        <textarea
          className={`${inputClass} min-h-48`}
          value={explanations}
          onChange={(e) => setExplanations(e.target.value)}
          placeholder="Worked explanations for what you covered. Blank lines separate paragraphs."
        />
      </label>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-semibold text-navy-900">Practice questions</span>
        {items.map((item, index) => (
          <div key={index} className="rounded-lg border border-navy-100 bg-navy-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-navy-400">
                Question {index + 1}
              </span>
              <button
                type="button"
                onClick={() => setItems(items.filter((_, i) => i !== index))}
                className="text-xs font-semibold text-navy-500 hover:text-[var(--error)]"
              >
                Remove
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                className={`${inputClass} min-h-16`}
                value={item.prompt}
                onChange={(e) => update(index, { prompt: e.target.value })}
                placeholder="Question"
              />
              <input
                className={inputClass}
                value={item.answer}
                onChange={(e) => update(index, { answer: e.target.value })}
                placeholder="Answer (0.5, 1/2 and 50% all match)"
              />
              <textarea
                className={`${inputClass} min-h-16`}
                value={item.explanation}
                onChange={(e) => update(index, { explanation: e.target.value })}
                placeholder="Explanation shown after they answer (optional)"
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, { prompt: "", answer: "", explanation: "" }])}
          className="rounded-lg border border-dashed border-navy-200 px-4 py-3 text-sm font-semibold text-navy-600 hover:border-navy-400 hover:text-navy-900"
        >
          + Add a question
        </button>
      </div>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {message && <p className="text-sm text-[var(--success)]">{message}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => save(true)}
          disabled={pending}
          className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          {pending ? "Saving…" : draft.publishedAt ? "Save & republish" : "Publish to student"}
        </button>
        <button
          type="button"
          onClick={() => save(false)}
          disabled={pending}
          className="rounded-lg border border-navy-200 px-5 py-2.5 text-sm font-semibold text-navy-800 hover:border-navy-400 disabled:opacity-60"
        >
          Save draft
        </button>
      </div>
    </div>
  );
}
