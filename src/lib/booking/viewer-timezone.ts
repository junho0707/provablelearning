import { cookies } from "next/headers";
import { isValidTimeZone } from "@/lib/time-format";
import { TUTOR_TIMEZONE } from "./timezone";
import { VIEWER_TIMEZONE_COOKIE } from "./timezone-cookie";

/**
 * The time zone a page should render its times in: the visitor's own, once we know it.
 *
 * A server component cannot read `Intl.DateTimeFormat().resolvedOptions()` and get anything about
 * the visitor — it gets the server's zone. So the browser tells us once, in a cookie, and every
 * server render after that is in the visitor's own hours (`TimeZoneProbe`).
 *
 * Before that cookie exists — the very first render, or a visitor who blocks cookies — times fall
 * back to the tutor's zone, which is the zone the business actually runs in (ADR-003). That is the
 * one wrong-but-honest answer available, and it is labelled, so a Pacific buyer reads "12:00 PM
 * EDT" rather than an unmarked "12:00 PM" that might be either.
 */
export async function viewerTimeZone(): Promise<string> {
  const value = (await cookies()).get(VIEWER_TIMEZONE_COOKIE)?.value;
  return value && isValidTimeZone(value) ? value : TUTOR_TIMEZONE;
}
