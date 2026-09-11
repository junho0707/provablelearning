import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

/** Shared chrome for the legal pages, matching the rest of the public site rather than standing apart from it. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
