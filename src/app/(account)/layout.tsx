import { SiteNav } from "@/components/site-nav";
import { GROUND } from "@/lib/ui";

/**
 * Account pages share the site header so the nav tabs stay reachable once signed in — and, since
 * they share the header, they share the ground it sits on. The grey the app pages used to stand on
 * made crossing the sign-in feel like arriving at a second product.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: GROUND }} className="min-h-screen">
      <SiteNav />
      {children}
    </div>
  );
}
