import Link from "next/link";
import type { TreeNode } from "@/lib/content/types";

/**
 * The list rendering of the same tree the graph draws. Grouped by the top-level sections beneath
 * the single `math` root — not by `course: true`, which today flags four shells holding no authored
 * lessons at all. Server component: no JS, `<details>` does the collapsing.
 */

const lessonHref = (id: string) => `/courses/${id}`;

function countLessons(node: TreeNode): number {
  return (node.kind === "lesson" ? 1 : 0) + node.children.reduce((n, c) => n + countLessons(c), 0);
}

/** The six children of `math` are the sections; if the shape ever changes, fall back to the roots. */
function sectionsOf(roots: TreeNode[]): TreeNode[] {
  return roots.length === 1 && roots[0].children.length > 0 ? roots[0].children : roots;
}

export function CourseView({ roots }: { roots: TreeNode[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {sectionsOf(roots).map((section) => (
        <SectionCard key={section.id} section={section} />
      ))}
    </div>
  );
}

function SectionCard({ section }: { section: TreeNode }) {
  const total = countLessons(section);

  return (
    <section className="rounded-xl border border-navy-100 bg-white p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold text-navy-950">{section.title}</h2>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-navy-400">
          {total > 0 ? `${total} lesson${total === 1 ? "" : "s"}` : "coming soon"}
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-3 text-sm text-navy-500">Mapped out — lessons are on the way.</p>
      ) : (
        <div className="mt-4">
          {section.children.map((child) => (
            <Branch key={child.id} node={child} depth={0} />
          ))}
        </div>
      )}
    </section>
  );
}

function Branch({ node, depth }: { node: TreeNode; depth: number }) {
  if (node.kind === "lesson") return <LessonRow node={node} />;

  const total = countLessons(node);
  if (total === 0) return null;

  return (
    <details open={depth === 0} className="border-l border-navy-100 pl-3">
      <summary className="cursor-pointer py-1.5 text-sm font-semibold text-navy-800">
        {node.title}
        <span className="ml-2 text-xs font-normal text-navy-400">{total}</span>
      </summary>
      <div className="pb-1">
        {node.children.map((child) => (
          <Branch key={child.id} node={child} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

function LessonRow({ node }: { node: TreeNode }) {
  const readable = node.hasContent && !node.planned;

  const inner = (
    <span className="flex items-baseline gap-2.5 py-1.5">
      {node.number != null && (
        <span className="text-xs font-semibold tabular-nums text-navy-400">{node.number}</span>
      )}
      <span className={readable ? "text-navy-900" : "text-navy-400"}>{node.title}</span>
      {node.role === "application" && (
        <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-600">
          applies
        </span>
      )}
      {!readable && <span className="text-xs text-navy-400">· coming soon</span>}
    </span>
  );

  return readable ? (
    <Link href={lessonHref(node.id)} className="block rounded px-1 text-sm hover:bg-navy-50">
      {inner}
    </Link>
  ) : (
    <span className="block px-1 text-sm">{inner}</span>
  );
}
