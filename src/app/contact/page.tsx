import { SiteNav } from "@/components/site-nav";
import { ContactForm } from "@/components/contact-form";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <main className="bg-navy-950 text-white">
      <SiteNav />
      <div className="mx-auto max-w-[1200px] px-6 py-24 sm:px-10 sm:py-28">
        <h1 className="text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
          Get in touch.
        </h1>
        <div className="mt-12 max-w-md">
          <ContactForm />
        </div>
      </div>
    </main>
  );
}
