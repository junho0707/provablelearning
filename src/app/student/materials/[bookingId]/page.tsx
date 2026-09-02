import Link from "next/link";
import { notFound } from "next/navigation";
import { getMaterialForStudent } from "@/lib/sessions/materials";
import { Practice } from "./practice";

export const metadata = { title: "Your materials" };

/** Renders the tutor's plain text with its paragraph breaks intact, and nothing else. */
function Prose({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 text-navy-800">
      {text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, i) => (
          <p key={i} className="whitespace-pre-line leading-relaxed">
            {paragraph}
          </p>
        ))}
    </div>
  );
}

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const material = await getMaterialForStudent(bookingId);
  if (!material) notFound();

  return (
    <main className="mx-auto max-w-[720px] px-5 py-12">
      <Link href="/student" className="text-sm font-semibold text-navy-600 hover:text-navy-900">
        ← Back
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-navy-950">
        What to work on next
      </h1>

      {material.summary && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-navy-950">Where you&apos;re at</h2>
          <Prose text={material.summary} />
        </section>
      )}

      {material.roadmap && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-navy-950">Your next steps</h2>
          <Prose text={material.roadmap} />
        </section>
      )}

      {material.explanations && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-navy-950">Explanations</h2>
          <Prose text={material.explanations} />
        </section>
      )}

      <Practice items={material.items} />
    </main>
  );
}
