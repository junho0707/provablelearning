import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * Only the marketing and legal pages are public (`system/00-BUSINESS.md` §1). Everything else is
 * behind a login and has nothing to offer a crawler, so it is disallowed explicitly rather than
 * left to chance — a stray link into `/student` or `/admin` should not become an indexed URL.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/student", "/admin", "/dashboard", "/book", "/sessions", "/credits", "/account", "/messages", "/api"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
