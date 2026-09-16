import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Never cached, never prerendered: a health check answered from the build is not a health check. */
export const dynamic = "force-dynamic";

/**
 * What an external uptime monitor watches.
 *
 * "The page loads" is not the question — the app can serve HTML perfectly while Postgres is
 * unreachable, and every surface behind sign-in is then broken. So this proves the round trip the
 * whole product depends on: this deployment can reach Supabase and get an answer.
 *
 * Deliberately **unauthenticated**, because a monitor cannot hold a session, and deliberately
 * mute: it reads one innocuous availability row and returns no data of any kind, so the most an
 * anonymous caller learns is whether the system is up — which is what a status page says anyway.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { error } = await createAdminClient()
      .from("availability_rules")
      .select("weekday")
      .limit(1);
    if (error) throw new Error(error.message);
  } catch {
    // 503, not 200-with-a-flag: the monitor decides by status code, and a body nobody parses is
    // how an outage gets reported as healthy.
    return NextResponse.json(
      { ok: false, error: { code: "database_unreachable" } },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
