"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { SignInModal } from "@/components/auth/sign-in-modal";

/**
 * Buyer navigation. There are **no public tabs** — content is not public at launch
 * (`system/00-BUSINESS.md` §1, AT-CONTENT-3), so a signed-out visitor has the marketing page and
 * nothing else to navigate to. Ordered by use: booking and sessions are the whole product.
 */
const ACCOUNT_TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/book", label: "Book" },
  { href: "/sessions", label: "Sessions" },
  { href: "/credits", label: "Credits" },
  { href: "/messages", label: "Messages" },
  { href: "/account", label: "Account" },
];
const PUBLIC_TABS: Array<{ href: string; label: string }> = [];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The bar is the one floating object in the design — every panel below it is flat, hard-edged and
 * full-bleed, so the pill earns its blur and radius by being the only thing that has them. Active
 * state is a filled pill rather than an underline: inside a rounded container an underline reads as
 * a stray rule.
 */
function linkClass(active: boolean) {
  return `rounded-full px-3.5 py-2 leading-none transition-colors ${
    active ? "bg-navy-950 text-white" : "text-navy-700 hover:bg-navy-950/5 hover:text-navy-950"
  }`;
}

export function SiteNavClient({
  email,
  overlay = false,
}: {
  email: string | null;
  /**
   * Paint over the page instead of pushing it down. The landing hero is a full-bleed navy panel
   * that the bar is meant to float on top of; every other page starts with ordinary content and
   * needs the spacer, or its first heading slides under the bar.
   */
  overlay?: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  // Navigating away should never leave the mobile panel hanging open.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const tabs = email ? [...ACCOUNT_TABS, ...PUBLIC_TABS] : PUBLIC_TABS;

  return (
    <>
      {/* `z-40`: the bar is fixed and blurred, so it paints as one isolated unit. Left at the
          default z-index it would lose to any later sibling of `main`. */}
      <header className="fixed inset-x-0 top-3 z-40 px-3 sm:top-4 sm:px-4">
        <nav className="mx-auto flex w-fit max-w-full items-center gap-2 rounded-full border border-navy-950/10 bg-white/80 p-2 shadow-[0_8px_30px_-12px_rgba(11,18,34,0.3)] backdrop-blur-xl sm:gap-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 pl-1.5 pr-1 font-semibold tracking-tight text-navy-950 sm:pl-2"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-950 text-xs font-bold leading-none text-gold-400">
              P
            </span>
            <span className="whitespace-nowrap text-[0.9375rem] leading-none">
              Provable Learning
            </span>
          </Link>

          {tabs.length > 0 && (
            <div className="hidden items-center gap-0.5 text-sm font-medium md:flex">
              {tabs.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={linkClass(isActive(pathname, link.href))}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2 text-sm font-medium">
            {email ? (
              <div className="hidden items-center gap-2 md:flex">
                <span
                  title={email}
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center rounded-full bg-navy-950 text-xs font-bold uppercase text-white"
                >
                  {email.slice(0, 1)}
                </span>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="rounded-full px-3.5 py-2 leading-none text-navy-600 hover:bg-navy-950/5 hover:text-navy-950"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSignInOpen(true)}
                className="rounded-full bg-navy-950 px-4 py-2.5 leading-none text-white hover:bg-navy-800"
              >
                Sign in
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-label="Menu"
              className={`grid h-9 w-9 place-items-center rounded-full text-navy-700 hover:bg-navy-950/5 hover:text-navy-950 ${
                tabs.length > 0 ? "md:hidden" : "hidden"
              }`}
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
          </div>
        </nav>

        {mobileOpen && (
          <div className="mx-auto mt-2 w-full max-w-sm rounded-3xl border border-navy-950/10 bg-white/95 p-3 text-sm font-medium shadow-[0_8px_30px_-12px_rgba(11,18,34,0.3)] backdrop-blur-xl md:hidden">
            {tabs.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-full px-4 py-2.5 ${
                  isActive(pathname, link.href)
                    ? "bg-navy-950 text-white"
                    : "text-navy-700"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {email && (
              <>
                <div className="my-2 h-px bg-navy-950/10" />
                <p className="truncate px-4 py-1 text-xs font-normal text-navy-500">{email}</p>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="block w-full rounded-full px-4 py-2.5 text-left text-navy-700"
                  >
                    Sign out
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </header>

      {/* The bar is out of flow; without this every page's first element starts underneath it. */}
      {!overlay && <div aria-hidden="true" className="h-[4.75rem] sm:h-[5.25rem]" />}

      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}
