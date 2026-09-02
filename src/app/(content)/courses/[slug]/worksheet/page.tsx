import { notFound } from "next/navigation";
import { getLesson } from "@/lib/content/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Choice, QuestionType } from "@/lib/practice/types";
import { PrintButton } from "./print-button";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const lesson = getLesson((await params).slug);
  return lesson ? { title: `${lesson.title} — Worksheet` } : {};
}

type QuestionRow = {
  id: string;
  lesson_slug: string;
  position: number;
  type: QuestionType;
  prompt: string;
  choices: Choice[] | null;
  answer: string | null;
  tolerance: number | null;
  explanation: string;
};

/**
 * TASK-WORKSHEET-001. Generated from the same question bank as the interactive practice section —
 * no separate authoring (spec/14 §7) — as a printable page (browser print-to-PDF, no PDF library
 * needed). The answer key intentionally includes real answers: this is a study handout the visitor
 * requested, not an API response a script could scrape mid-attempt (AT-PRACTICE-005's boundary is
 * about the interactive check, not this).
 */
export default async function WorksheetPage({ params }: { params: Promise<{ slug: string }> }) {
  const lesson = getLesson((await params).slug);
  if (!lesson || !lesson.hasContent) notFound();

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("questions")
    .select("id, lesson_slug, position, type, prompt, choices, answer, tolerance, explanation")
    .eq("lesson_slug", lesson.slug)
    .order("position");
  const questions = (data ?? []) as QuestionRow[];

  if (questions.length === 0) notFound();

  return (
    <main className="mx-auto max-w-[720px] px-5 py-16 print:px-0 print:py-8">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-950">{lesson.title} — Worksheet</h1>
        <PrintButton />
      </div>
      <h1 className="mb-8 hidden text-2xl font-extrabold print:block">{lesson.title} — Worksheet</h1>

      <ol className="space-y-8">
        {questions.map((q, i) => (
          <li key={q.id}>
            <p className="font-semibold text-navy-950">
              {i + 1}. {q.prompt}
            </p>
            {q.type === "mcq" && q.choices && (
              <ul className="mt-2 space-y-1 pl-5">
                {q.choices.map((c) => (
                  <li key={c.id}>
                    ☐ {c.label}
                  </li>
                ))}
              </ul>
            )}
            {q.type !== "mcq" && <div className="mt-4 h-16 border-b border-dashed border-navy-300" />}
          </li>
        ))}
      </ol>

      <div className="mt-16 break-before-page border-t border-navy-200 pt-8">
        <h2 className="mb-4 text-lg font-bold text-navy-950">Answer key</h2>
        <ol className="space-y-3 text-sm">
          {questions.map((q, i) => (
            <li key={q.id}>
              <strong>{i + 1}.</strong> {answerLabel(q)} — {q.explanation}
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

function answerLabel(q: QuestionRow): string {
  if (q.type === "free") return "(worked solution below)";
  if (q.type === "mcq") return q.choices?.find((c) => c.id === q.answer)?.label ?? (q.answer ?? "");
  return q.answer ?? "";
}
