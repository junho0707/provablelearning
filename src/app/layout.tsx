import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

// Outfit is the wordmark's typeface, so the page and the logo share one voice. It ships as a
// variable font — no `weight` list, every weight from 100–900 comes out of the single file.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Provable Learning — Learn Math from the Ground Up, Free",
    template: "%s · Provable Learning",
  },
  description:
    "A free, structured math course — from the ground up, in order. Read lessons and practice, no account needed. Optional 1:1 tutoring when you want it.",
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
