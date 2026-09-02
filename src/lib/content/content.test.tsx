import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getTree,
  getLesson,
  getAllLessons,
  getLessonNeighbors,
  getLessonTrail,
} from "./catalog";
import { renderMdx } from "./mdx";
import sitemap from "@/app/sitemap";
import { generateMetadata } from "@/app/(content)/courses/[slug]/page";

// Structure comes from roadmap/roadmap.json (ADR-002); lesson prose from content/<slug>.mdx.
// `fractions-definition` is the authored fixture; the rest are scaffolded stubs.

describe("catalog — tree built from the roadmap (ADR-002)", () => {
  it("builds a nested concept/lesson tree", () => {
    const tree = getTree();
    expect(tree.length).toBeGreaterThan(0);
    type N = ReturnType<typeof getTree>[number];
    const find = (nodes: N[], id: string): N | undefined => {
      for (const n of nodes) {
        if (n.id === id) return n;
        const hit = find(n.children, id);
        if (hit) return hit;
      }
      return undefined;
    };
    const fractions = find(tree, "fractions");
    expect(fractions?.kind).toBe("concept");
    // the definition lesson nests under its concept
    expect(fractions?.children.some((c) => c.id === "fractions-definition")).toBe(true);
  });

  it("orders lessons ascending by their roadmap number", () => {
    const nums = getAllLessons().map((l) => l.number);
    expect(nums).toEqual([...nums].sort((a, b) => (a ?? 0) - (b ?? 0)));
    // fractions-definition is authored; it should appear as a numbered lesson (position is map-driven).
    expect(getAllLessons().some((l) => l.slug === "fractions-definition" && l.number != null)).toBe(true);
  });

  it("flags a stub lesson as not-yet-authored", () => {
    const tree = getTree();
    const find = (nodes: ReturnType<typeof getTree>, id: string): boolean =>
      nodes.some((n) => (n.id === id ? n.hasContent : find(n.children, id)));
    // authored vs stub
    expect(getLesson("fractions-definition")?.hasContent).toBe(true);
    expect(getLesson("division")?.hasContent).toBe(false);
    expect(find(tree, "fractions-definition")).toBe(true);
  });
});

describe("lesson lookup by slug (the roadmap node id / DB join key)", () => {
  it("returns an authored lesson with its MDX body", () => {
    const lesson = getLesson("fractions-definition");
    expect(lesson?.title).toBe("Fractions - Definition");
    expect(lesson?.body).toContain("equal parts");
  });

  it("returns null for an unknown slug or a concept container (drives the 404)", () => {
    expect(getLesson("does-not-exist")).toBeNull();
    expect(getLesson("fractions")).toBeNull(); // a concept has no page
  });

  it("computes Learning-Path neighbors in number order", () => {
    const ordered = getAllLessons();
    const i = ordered.findIndex((l) => l.slug === "fractions-definition");
    const { prev, next } = getLessonNeighbors("fractions-definition");
    expect(prev?.slug ?? null).toBe(ordered[i - 1]?.slug ?? null);
    expect(next?.slug ?? null).toBe(ordered[i + 1]?.slug ?? null);
  });

  it("builds a breadcrumb trail rooted at a top-level concept and ending at the lesson", () => {
    const trail = getLessonTrail("fractions-definition").map((t) => t.id);
    expect(trail[trail.length - 1]).toBe("fractions-definition");
    expect(trail).toContain("fractions");
    // the first entry is a root concept (no page of its own)
    expect(getLesson(trail[0])).toBeNull();
  });
});

describe("MDX + KaTeX server rendering (REQ-CONTENT-003, AT-CONTENT-001)", () => {
  it("renders prose and math to static HTML server-side", async () => {
    const html = renderToStaticMarkup(await renderMdx(getLesson("fractions-definition")!.body));
    expect(html).toContain("denominator"); // prose present without client JS
    expect(html).toContain("katex"); // math rendered to markup at render time
  });
});

describe("SEO surface (NFR-PERF-003, AT-CONTENT-003)", () => {
  it("lists the roadmap and every lesson in the sitemap", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/roadmap"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/courses/fractions-definition"))).toBe(true);
  });

  it("omits the redirecting /courses index", () => {
    expect(sitemap().map((e) => e.url).some((u) => u.endsWith("/courses"))).toBe(false);
  });

  it("exposes title/description/canonical metadata per lesson", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "fractions-definition" }),
    });
    expect(meta.title).toBe("Fractions - Definition");
    expect(meta.description).toBeTruthy();
    expect(meta.alternates?.canonical).toBe("/courses/fractions-definition");
  });

  it("returns empty metadata for an unknown lesson", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ slug: "nope" }) });
    expect(meta.title).toBeUndefined();
  });
});
