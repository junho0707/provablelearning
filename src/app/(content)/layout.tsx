import { SiteNav } from "@/components/site-nav";

/** Shared chrome for the public Learning Path (catalog, course, lesson pages). */
export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa]">
      <SiteNav />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-navy-100 bg-white">
        <div className="mx-auto max-w-[1120px] px-5 py-8 text-sm text-navy-500 sm:px-8">
          © Provable Learning
        </div>
      </footer>
    </div>
  );
}
