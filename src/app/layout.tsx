import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { PRICING, formatPrice } from "@/lib/pricing";

// Outfit is the wordmark's typeface, so the page and the logo share one voice. It ships as a
// variable font — no `weight` list, every weight from 100–900 comes out of the single file.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

/**
 * What a search result shows. This is the one piece of copy that is read by people who have never
 * seen the site, so it has to describe what is actually sold: 1:1 sessions, with the First Session
 * as the entry price (`system/00-BUSINESS.md` §1).
 *
 * It previously advertised a free public lesson catalog read without an account — the model ADR-007
 * reversed. Content is not public at launch, so that description promised a page no visitor could
 * reach. The price comes from `lib/pricing` rather than being typed here, for the same reason it is
 * never typed into page copy.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Provable Learning — 1:1 Math Tutoring for K–12",
    template: "%s · Provable Learning",
  },
  description:
    `One-on-one math tutoring for K–12, elementary through calculus. School-year help, SAT / PSAT / ACT prep, and diagnostics that find the gaps. First 60-minute session ${formatPrice(PRICING.first_session.priceCents)}.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} antialiased overflow-x-hidden`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
