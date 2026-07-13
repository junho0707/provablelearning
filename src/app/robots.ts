import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/** Allow crawling of all public content and point crawlers at the sitemap (NFR-PERF-003). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
