import { createClient } from "@supabase/supabase-js";

/**
 * Cookieless anon Supabase client for public content reads (no user session). Safe during static
 * generation — it never touches `cookies()` — and, because it authenticates as the `anon` role, the
 * column grants in migration 0002 mean it physically cannot read the auto-check answer secret.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
