import Link from "next/link";
import type { TreeNode } from "@/lib/content/types";

/**
 * The small-screen view of the same curriculum. A pannable tree is unusable on a phone, so the
 * identical data is served as a collapsible outline — concepts expand, lessons link out. Server
 * component: no JS, `<details>` does the work.
 */
const lessonHref = (id: string) => `/courses/${id}`;

export function RoadmapOutline({ roots }: { roots: TreeNode[] }) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-4">
      {roots.map((n) => (
        <OutlineNode key={n.id} node={n} depth={0} />
      ))}
    </div>
  );
}

function OutlineNode({ node, depth }: { node: TreeNode; depth: number }) {
  if (node.kind === "lesson") {
    const label = (
      <span className="flex items-center gap-2 py-1.5">
        {node.number != null && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-navy-950">
            {node.number}
          </span>
        )}
        <span className={node.planned ? "text-navy-400" : "text-navy-800"}>{node.title}</span>
        {node.role === "application" && (
          <span className="text-[10px] font-bold uppercase text-gold-600">applies</span>
        )}
      </span>
    );
    return (
      <div style={{ paddingLeft: depth * 12 }} className="text-sm">
        {node.hasContent && !node.planned ? (
          <Link href={lessonHref(node.id)} className="hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </div>
    );
  }

  return (
    <details open={depth < 2} style={{ paddingLeft: depth * 12 }}>
      <summary
        className={`cursor-pointer py-1.5 text-sm font-bold ${
          node.planned ? "text-navy-400" : "text-navy-950"
        }`}
      >
        {node.title}
        {node.planned && <span className="ml-2 text-[10px] font-normal uppercase">coming soon</span>}
      </summary>
      {node.children.map((c) => (
        <OutlineNode key={c.id} node={c} depth={depth + 1} />
      ))}
    </details>
  );
}
