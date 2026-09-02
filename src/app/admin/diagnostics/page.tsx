import Link from "next/link";
import { listDiagnostics } from "@/lib/admin/diagnostics";
import { CreateDiagnostic } from "./create-diagnostic";

export const metadata = { title: "Admin — diagnostics" };

/**
 * R7 / AT-OPS-5. Diagnostics are authored here as data, after launch if that suits — a purpose
 * with no diagnostic still sells and still books; its students get the descriptive questions
 * instead (AT-PRE-7).
 */
export default async function DiagnosticsPage() {
  const diagnostics = await listDiagnostics();

  return (
    <div>
      <h1 className="mb-2 text-xl font-extrabold text-navy-950">Diagnostics</h1>
      <p className="mb-6 text-sm text-navy-600">
        One set per test, and one per math class level. Nothing is served until it is published, and
        a purpose with no published set falls back to asking the student to describe where they are.
      </p>

      <ul className="space-y-3">
        {diagnostics.map((diagnostic) => (
          <li key={diagnostic.id} className="rounded-lg border border-navy-100 p-4 text-sm">
            <Link href={`/admin/diagnostics/${diagnostic.id}`} className="block">
              <p className="font-semibold text-navy-900">
                {diagnostic.name}
                <span className="ml-2 font-normal text-navy-500">
                  {diagnostic.kind === "math_diagnostic"
                    ? `class level · ${diagnostic.classLevel}`
                    : `test prep · ${diagnostic.slug}`}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-navy-500">
                {diagnostic.questionCount} question{diagnostic.questionCount === 1 ? "" : "s"} ·{" "}
                {diagnostic.publishedAt ? "published" : "not published"}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8 border-t border-navy-100 pt-6">
        <CreateDiagnostic />
      </div>
    </div>
  );
}
