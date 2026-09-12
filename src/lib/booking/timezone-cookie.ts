/**
 * The cookie the browser uses to tell the server which zone the visitor is in.
 *
 * Its own module because both halves need the name and they live on opposite sides of the
 * server/client boundary: `viewer-timezone.ts` reads it through `next/headers`, which may not be
 * pulled into a client bundle, and `TimeZoneProbe` writes it from the browser.
 */
export const VIEWER_TIMEZONE_COOKIE = "tz";
