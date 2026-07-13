/**
 * Canonical site origin, used for absolute SEO metadata (canonical URLs, sitemap). Set
 * `NEXT_PUBLIC_SITE_URL` per environment; the fallback is the production apex (PRD OQ3 cutover).
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://provablelearning.com").replace(
  /\/$/,
  "",
);

/** Absolute URL for a content path (leading slash required). */
export function absoluteUrl(pathname: string): string {
  return `${SITE_URL}${pathname}`;
}
