import { SiteNav } from "@/components/site-nav";

/** Account pages share the site header so the nav tabs stay reachable once signed in. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <SiteNav />
      {children}
    </div>
  );
}
