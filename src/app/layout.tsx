import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

const inter = Inter({
  variable: "--font-inter",
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
      <body className={`${inter.variable} antialiased overflow-x-hidden`}>
        {children}
      </body>
    </html>
  );
}
