import { getAllLessons } from "@/lib/content/catalog";
import { listQuestionsForLesson } from "@/lib/admin/questions";
import { QuestionEditor } from "./question-editor";
import { LessonPicker } from "./lesson-picker";

export const metadata = { title: "Admin — questions" };

/** TASK-ADMIN-001, "question CRUD". */
export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ lesson?: string }> }) {
  const lessons = getAllLessons();
  const lessonSlug = (await searchParams).lesson ?? lessons[0]?.slug;
  const questions = lessonSlug ? await listQuestionsForLesson(lessonSlug) : [];

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-navy-950">Questions</h1>

      <LessonPicker lessons={lessons.map((l) => ({ slug: l.slug, title: l.title }))} selected={lessonSlug} />

      {lessonSlug && <QuestionEditor lessonSlug={lessonSlug} questions={questions} />}
    </div>
  );
}
