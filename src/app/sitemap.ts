import type { MetadataRoute } from "next";
import { getAllLessons } from "@/lib/content/catalog";
import { absoluteUrl } from "@/lib/site";

/**
 * Crawlable index of the public Learning Path (NFR-PERF-003): landing, the courses index, and every
 * lesson page. Regenerated at build from the roadmap. Concept containers have no page, so they're
 * not listed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1 },
    { url: absoluteUrl("/courses"), changeFrequency: "weekly", priority: 0.9 },
  ];

  for (const lesson of getAllLessons()) {
    entries.push({
      url: absoluteUrl(`/courses/${lesson.slug}`),
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  return entries;
}
