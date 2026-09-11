"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { signOutStudent } from "@/lib/auth/student";
import { SignInPopover } from "@/components/auth/sign-in-popover";
import { BrandWordmark } from "@/components/brand-wordmark";

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

// `relative` + `after:absolute`: the underline needs to sit below the text without adding to the
// link's box height. A layout-affecting `border-b`/`padding-bottom` would grow the box on the
// bottom only, shifting the text upward relative to the logo (whose box has no such asymmetry).
function linkClass(active: boolean) {
  return `relative after:absolute after:inset-x-0 after:-bottom-1.5 after:h-px ${
    active
      ? "text-navy-950 after:bg-navy-950"
      : "text-navy-700 hover:text-navy-950 after:bg-transparent"
  }`;
}

export function SiteNavClient({
  email,
  isStudent,
}: {
  email: string | null;
  isStudent: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Navigating away should never leave the mobile panel hanging open.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const tabs = email ? [...ACCOUNT_TABS, ...PUBLIC_TABS] : PUBLIC_TABS;

  return (
    // A flat band in flow, not a floating object: the page below is built from hard-edged panels
    // butted together, so the header is the first of them — a hairline is the only separator, and
    // nothing here has a radius or a shadow. `sticky` keeps it reachable while scrolling without
    // taking it out of flow, so no page needs a spacer; the panels are opaque, hence the blur.
    <header className="sticky top-0 z-40 border-b border-navy-950/10 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-8 px-6 sm:px-10">
        <div className="flex h-8 items-center gap-10">
          <Link href="/" className="flex h-8 items-center text-navy-950">
            <BrandWordmark className="h-[22px] w-auto" />
          </Link>
          {tabs.length > 0 && (
            <div className="hidden h-8 items-center gap-7 text-sm font-medium leading-none md:flex">
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
        </div>

        <div className="flex items-center gap-6 text-sm font-medium">
          {email ? (
            // Account is a tab now, so there's nothing left for a dropdown to hold — just the
            // one action, shown plainly instead of hidden behind a click.
            <div className="hidden items-center gap-3 md:flex">
              <span
                title={email}
                aria-hidden="true"
                className="grid h-7 w-7 place-items-center bg-navy-950 text-xs font-bold uppercase leading-none text-white"
              >
                {email.slice(0, 1)}
              </span>
              <form action={signOut}>
                <button type="submit" className="text-navy-600 hover:text-navy-950">
                  Sign out
                </button>
              </form>
            </div>
          ) : isStudent ? (
            // A student gets neither the buyer's tabs nor the buyer's sign-in popover — but this
            // header is still the only one on the page, so it has to carry their own two exits.
            // Leaving the slot empty stranded them on a public page with no way out.
            <div className="flex items-center gap-5">
              <Link href="/student" className="text-navy-700 hover:text-navy-950">
                My sessions
              </Link>
              <form action={signOutStudent}>
                <button type="submit" className="text-navy-600 hover:text-navy-950">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <SignInPopover
              label="Sign in"
              align="right"
              className="bg-navy-950 px-5 py-2.5 font-semibold leading-none text-white hover:bg-navy-800"
            />
          )}

          {tabs.length > 0 && (
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-label="Menu"
              className="text-navy-700 hover:text-navy-950 md:hidden"
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
          )}
        </div>
      </nav>

      {mobileOpen && (
        <div className="border-t border-navy-950/10 px-6 py-3 text-sm font-medium md:hidden">
          {tabs.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block py-2 ${
                isActive(pathname, link.href) ? "text-navy-950" : "text-navy-700"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {email && (
            <>
              <div className="my-2 h-px bg-navy-950/10" />
              <p className="truncate py-1 text-xs font-normal text-navy-500">{email}</p>
              <form action={signOut}>
                <button type="submit" className="block w-full py-2 text-left text-navy-700">
                  Sign out
                </button>
              </form>
            </>
          )}
        </div>
      )}

    </header>
  );
}
