import { createClient } from "@/lib/supabase/server";
import { SiteNavClient } from "@/components/site-nav-client";

/** Top navigation shared across public and account pages. */
export async function SiteNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <SiteNavClient email={user?.email ?? null} />;
}
