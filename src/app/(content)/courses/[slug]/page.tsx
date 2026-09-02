import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "katex/dist/katex.min.css";
import { getAllLessons, getLesson, getLessonNeighbors, getLessonTrail } from "@/lib/content/catalog";
import { renderMdx } from "@/lib/content/mdx";
import { getLessonQuestions } from "@/lib/practice/questions";
import { PracticeQuestions } from "./practice-questions";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return getAllLessons().map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const lesson = getLesson((await params).slug);
  if (!lesson) return {};
  return {
    title: lesson.title,
    description: lesson.summary,
    alternates: { canonical: `/courses/${lesson.slug}` },
  };
}

export default async function LessonPage({ params }: { params: Promise<Params> }) {
  const lesson = getLesson((await params).slug);
  if (!lesson) notFound();

  const trail = getLessonTrail(lesson.slug).slice(0, -1); // ancestors only (drop self)
  const { prev, next } = getLessonNeighbors(lesson.slug);
  const questions = lesson.hasContent ? await getLessonQuestions(lesson.slug) : [];

  return (
    <article className="mx-auto max-w-[720px] px-5 py-16 sm:px-8">
      <nav className="mb-6 text-sm text-navy-500">
        <Link href="/roadmap?view=courses" className="hover:text-navy-950">
          Courses
        </Link>
        {trail.map((a) => (
          <span key={a.id}>
            <span className="mx-2">/</span>
            <span className="text-navy-600">{a.title}</span>
          </span>
        ))}
      </nav>

      <h1 className="mb-8 text-3xl font-extrabold tracking-tight text-navy-950 sm:text-4xl">
        {lesson.title}
      </h1>

      {lesson.hasContent ? (
        <div className="lesson-prose">{await renderMdx(lesson.body)}</div>
      ) : (
        <div className="rounded-xl border border-dashed border-navy-200 bg-white p-8 text-navy-600">
          <p className="font-semibold text-navy-800">This lesson hasn&apos;t been written yet.</p>
          <p className="mt-1 text-sm">
            It&apos;s on the map — content is coming. Check back soon.
          </p>
        </div>
      )}

      {lesson.hasContent && <PracticeQuestions questions={questions} lessonSlug={lesson.slug} />}

      {lesson.hasContent && questions.length > 0 && (
        <p className="mt-6 text-sm">
          <Link href={`/courses/${lesson.slug}/worksheet`} className="font-semibold text-navy-700 underline">
            Printable worksheet →
          </Link>
        </p>
      )}

      <nav className="mt-16 flex justify-between gap-4 border-t border-navy-100 pt-6 text-sm">
        {prev ? (
          <Link href={`/courses/${prev.slug}`} className="font-semibold text-navy-700 hover:text-navy-950">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/courses/${next.slug}`}
            className="text-right font-semibold text-navy-700 hover:text-navy-950"
          >
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}
