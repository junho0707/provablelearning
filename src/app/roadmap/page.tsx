import type { Metadata } from "next";
import { getTree } from "@/lib/content/catalog";
import { layoutTree } from "@/lib/content/layout";
import { SiteNav } from "@/components/site-nav";
import { RoadmapOutline } from "@/components/roadmap/outline";
import { SkillTree } from "@/components/roadmap/skill-tree";

/**
 * The public curriculum map — the whole of school math as one picture, and (per the v3 ground truth)
 * the only structural thing a visitor sees without buying. Static: the layout is computed at build
 * time from `roadmap/roadmap.json`.
 */

export const metadata: Metadata = {
  title: "The Math Roadmap — every topic, in order",
  description:
    "The complete map of school mathematics: every topic from counting to calculus, what contains what, and what you have to learn first. Free to explore.",
  alternates: { canonical: "/roadmap" },
};

export default function RoadmapPage() {
  const roots = getTree();
  const layout = layoutTree(roots);
  const lessons = layout.nodes.filter((n) => n.kind === "lesson");
  const built = lessons.filter((n) => n.hasContent && !n.planned).length;

  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      <SiteNav />

      <section className="mx-auto max-w-[1240px] px-5 pt-14 sm:px-8">
        <p className="mb-3 text-sm font-bold uppercase tracking-widest text-gold-600">
          The Math Roadmap
        </p>
        <h1 className="mb-4 max-w-2xl text-3xl font-extrabold leading-[1.1] tracking-[-0.02em] text-navy-950 sm:text-4xl">
          All of school math, on one map.
        </h1>
        <p className="mb-8 max-w-xl text-navy-700">
          Every topic, what it lives inside, and what you have to learn before it. Solid lines are
          containment; dashed gold lines are prerequisites. Click any node to see where it sits.
        </p>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pb-16 sm:px-8">
        {/* Canvas on desktop; the same data as an outline on phones, where a tree is unreadable. */}
        <div className="hidden md:block">
          <SkillTree layout={layout} />
        </div>
        <div className="md:hidden">
          <RoadmapOutline roots={roots} />
        </div>

        <p className="mt-4 text-sm text-navy-500">
          {built} of {lessons.length} mapped lessons written so far · locked regions are mapped and
          on the way.
        </p>
      </section>

      <footer className="border-t border-navy-100 bg-white">
        <div className="mx-auto max-w-[1240px] px-5 py-8 text-sm text-navy-500 sm:px-8">
          © Provable Learning
        </div>
      </footer>
    </main>
  );
}
