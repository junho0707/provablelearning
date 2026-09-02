import Link from "next/link";
import { notFound } from "next/navigation";
import { listDiagnostics, getDiagnosticQuestionsForAdmin } from "@/lib/admin/diagnostics";
import { QuestionEditor } from "./question-editor";

export const metadata = { title: "Admin — diagnostic" };

export default async function DiagnosticDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [diagnostics, questions] = await Promise.all([
    listDiagnostics(),
    getDiagnosticQuestionsForAdmin(id),
  ]);
  const diagnostic = diagnostics.find((d) => d.id === id);
  if (!diagnostic) notFound();

  return (
    <div>
      <Link href="/admin/diagnostics" className="text-sm font-semibold text-navy-600 hover:text-navy-900">
        ← Diagnostics
      </Link>

      <h1 className="mt-4 text-xl font-extrabold text-navy-950">{diagnostic.name}</h1>
      <p className="mt-1 text-sm text-navy-600">
        {diagnostic.kind === "math_diagnostic"
          ? `Served to students whose current class matches “${diagnostic.classLevel}”.`
          : `Served to students booking ${diagnostic.slug.toUpperCase()} prep.`}{" "}
        {diagnostic.publishedAt ? "Published." : "Not published — no student sees it yet."}
      </p>

      <QuestionEditor
        diagnosticId={id}
        published={Boolean(diagnostic.publishedAt)}
        questions={questions.map((q) => ({
          id: q.id,
          position: q.position,
          type: q.type,
          prompt: q.prompt,
          answer: q.answer,
        }))}
      />
    </div>
  );
}
