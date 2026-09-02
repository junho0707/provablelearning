import type { Metadata } from "next";
import Link from "next/link";
import { getTree } from "@/lib/content/catalog";
import { layoutTree } from "@/lib/content/layout";
import { SiteNav } from "@/components/site-nav";
import { CourseView } from "@/components/roadmap/course-view";
import { SkillTree } from "@/components/roadmap/skill-tree";

/**
 * The public curriculum map. One dataset, two renderings: the graph (how topics relate) and the
 * course list (what to read, in order). `?view=` drives it so both are real, shareable URLs and
 * both render on the server.
 */

export const metadata: Metadata = {
  title: "The Math Roadmap — every topic, in order",
  description:
    "The complete map of school mathematics: every topic from counting to calculus, what contains what, and what you have to learn first. Free to explore.",
  alternates: { canonical: "/roadmap" },
};

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const isCourses = view === "courses";

  const roots = getTree();
  const layout = layoutTree(roots);
  const lessons = layout.nodes.filter((n) => n.kind === "lesson");
  const built = lessons.filter((n) => n.hasContent && !n.planned).length;

  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      <SiteNav />

      {/* Same 1120px shell as every other page, so the title lines up with the nav logo. */}
      <section className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-5 pt-20 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-[-0.01em] text-navy-950 sm:text-4xl">
          Math Roadmap
        </h1>
        <ViewToggle isCourses={isCourses} />
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pb-20 pt-6 sm:px-8">
        {isCourses ? (
          <CourseView roots={roots} />
        ) : (
          <>
            {/* A pannable graph is unusable on a phone, so small screens get the list instead. */}
            <div className="hidden md:block">
              <SkillTree layout={layout} />
            </div>
            <div className="md:hidden">
              <CourseView roots={roots} />
            </div>
          </>
        )}

        <p className="mt-4 text-sm text-navy-500">
          {built} of {lessons.length} mapped lessons written so far · locked regions are mapped and
          on the way.
        </p>
      </section>

      <footer className="border-t border-navy-100 bg-white">
        <div className="mx-auto max-w-[1120px] px-5 py-8 text-sm text-navy-500 sm:px-8">
          © Provable Learning
        </div>
      </footer>
    </main>
  );
}

/** Links, not client state — each view stays a shareable, server-rendered URL. */
function ViewToggle({ isCourses }: { isCourses: boolean }) {
  const base = "rounded-md px-3 py-1.5 text-sm font-semibold transition";
  const on = "bg-white text-navy-950 shadow-[var(--shadow-card)]";
  const off = "text-navy-600 hover:text-navy-950";

  return (
    <div className="flex gap-1 rounded-lg border border-navy-100 bg-navy-50 p-1">
      <Link href="/roadmap" className={`${base} ${isCourses ? off : on}`}>
        Graph
      </Link>
      <Link href="/roadmap?view=courses" className={`${base} ${isCourses ? on : off}`}>
        Courses
      </Link>
    </div>
  );
}
