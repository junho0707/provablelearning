import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * Content is **not public at launch** (`system/00-BUSINESS.md` §1), so there is no catalog to
 * index — the sitemap lists only the pages a signed-out visitor can actually reach. Lessons and
 * the roadmap return here when the catalog ships and restores the organic channel; the loop over
 * `getAllLessons()` that used to live in this file is what to bring back.
 *
 * `AT-CONTENT-2` asserts no content route appears here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/refund-policy"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
