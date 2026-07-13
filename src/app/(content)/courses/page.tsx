import type { Metadata } from "next";
import Link from "next/link";
import { getTree } from "@/lib/content/catalog";
import type { TreeNode } from "@/lib/content/types";

export const metadata: Metadata = {
  title: "Courses",
  description:
    "Browse the free, structured math Learning Path — concept by concept, lesson by lesson, in order. No account needed.",
  alternates: { canonical: "/courses" },
};

function countLessons(node: TreeNode): number {
  return (node.kind === "lesson" ? 1 : 0) + node.children.reduce((n, c) => n + countLessons(c), 0);
}

/** A concept container and everything beneath it. Roots render as top-level "course" sections. */
function ConceptBlock({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <section className={depth === 0 ? "" : "mt-4"}>
      <h3
        className={
          depth === 0
            ? "text-xl font-bold text-navy-950"
            : "text-sm font-semibold uppercase tracking-wide text-navy-500"
        }
      >
        {node.title}
      </h3>
      <div className={depth === 0 ? "mt-4 space-y-2" : "mt-2 space-y-2 border-l border-navy-100 pl-4"}>
        {node.children.map((child) =>
          child.kind === "concept" ? (
            <ConceptBlock key={child.id} node={child} depth={depth + 1} />
          ) : (
            <LessonRow key={child.id} node={child} />
          ),
        )}
      </div>
    </section>
  );
}

function LessonRow({ node }: { node: TreeNode }) {
  const inner = (
    <div className="flex items-baseline gap-3">
      <span className="text-xs font-semibold tabular-nums text-navy-400">{node.number}</span>
      <span className="font-medium">{node.title}</span>
      {node.role === "application" && (
        <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-600">
          applies
        </span>
      )}
      {!node.hasContent && <span className="text-xs text-navy-400">· coming soon</span>}
    </div>
  );

  return node.hasContent ? (
    <Link
      href={`/courses/${node.id}`}
      className="block rounded-lg px-3 py-2 text-navy-900 transition hover:bg-navy-50"
    >
      {inner}
    </Link>
  ) : (
    <Link href={`/courses/${node.id}`} className="block rounded-lg px-3 py-2 text-navy-400">
      {inner}
    </Link>
  );
}

export default function CoursesPage() {
  const tree = getTree();

  return (
    <div className="mx-auto max-w-[880px] px-5 py-16 sm:px-8">
      <header className="mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-navy-950 sm:text-4xl">Courses</h1>
        <p className="mt-3 max-w-2xl text-navy-700">
          A single, deliberate path through math — from the ground up, in order.
        </p>
      </header>

      <div className="space-y-10">
        {tree.map((root) => (
          <div
            key={root.id}
            className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]"
          >
            <ConceptBlock node={root} depth={0} />
            <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-navy-400">
              {countLessons(root)} lessons
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
