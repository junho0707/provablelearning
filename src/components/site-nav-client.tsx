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

// `relative` + `after:absolute`: the underline needs to sit below the text without adding to the
// link's box height. A layout-affecting `border-b`/`padding-bottom` would grow the box on the
// bottom only, shifting the text upward relative to the logo (whose box has no such asymmetry).
function linkClass(active: boolean) {
  return `relative after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:rounded-full ${
    active
      ? "text-navy-950 after:bg-navy-900"
      : "text-navy-700 hover:text-navy-950 after:bg-transparent"
  }`;
}

export function SiteNavClient({ email }: { email: string | null }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  // Navigating away should never leave the mobile panel hanging open.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const tabs = email ? [...ACCOUNT_TABS, ...PUBLIC_TABS] : PUBLIC_TABS;

  return (
    // `relative z-40`: `backdrop-blur` already forces the header into its own stacking context: an
    // isolated box that paints as a single unit against the rest of the page. Left at the default
    // z-index (auto, i.e. 0), that box loses to *any* later sibling of `main` — a z-index set only
    // on a dropdown deep inside the header can't out-rank content it's not being compared against.
    // The header needs its own stacking order raised, not its descendant's.
    <header className="relative z-40 border-b border-navy-100 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        {/* Left: identity + every tab, Sessions and Credits leading since they get used most. */}
        <div className="flex h-8 items-center gap-8">
          <Link
            href="/"
            className="flex h-8 items-center gap-2 font-extrabold tracking-tight leading-none text-navy-950"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy-900 text-sm leading-none text-gold-400">
              P
            </span>
            <span className="text-lg leading-none">Provable Learning</span>
          </Link>
          <div className="hidden h-8 items-center gap-6 text-sm font-semibold leading-none md:flex">
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
        </div>

        {/* Right: account */}
        <div className="flex items-center gap-6 text-sm font-semibold">
          {email ? (
            // Account is a tab now, so there's nothing left for a dropdown to hold — just the
            // one action, shown plainly instead of hidden behind a click.
            <div className="hidden items-center gap-3 md:flex">
              <span
                title={email}
                aria-hidden="true"
                className="grid h-7 w-7 place-items-center rounded-full bg-navy-900 text-xs font-bold uppercase text-white"
              >
                {email.slice(0, 1)}
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-navy-600 hover:text-navy-950"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSignInOpen(true)}
              className="rounded-lg bg-navy-900 px-4 py-2 text-white hover:bg-navy-800"
            >
              Sign in
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label="Menu"
            className="text-navy-700 hover:text-navy-950 md:hidden"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="border-t border-navy-100 px-5 py-3 text-sm font-semibold md:hidden">
          {tabs.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block py-2 ${
                isActive(pathname, link.href)
                  ? "text-navy-950"
                  : "text-navy-700"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {email && (
            <>
              <div className="my-2 h-px bg-navy-100" />
              <p className="truncate py-1 text-xs font-normal text-navy-500">
                {email}
              </p>
              <form action={signOut}>
                <button
                  type="submit"
                  className="block w-full py-2 text-left text-navy-700"
                >
                  Sign out
                </button>
              </form>
            </>
          )}
        </div>
      )}

      <SignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </header>
  );
}
