"use client";

import { useEffect, useRef, useState } from "react";
import { SignInPanel } from "./sign-in-panel";

/**
 * A trigger with the sign-in options anchored under it. **Not a modal:** there is no backdrop, no
 * focus trap and no scrim, so the page behind stays legible and clickable while it is open — it
 * closes on Escape, or on a click outside it.
 *
 * It is positioned absolutely rather than revealed in flow, so opening it never pushes the page
 * around under the visitor.
 */
export function SignInPopover({
  label,
  className,
  align = "center",
  redirectTo,
}: {
  label: string;
  /** Styling for the trigger — each caller's button already has a look; this keeps it. */
  className: string;
  align?: "center" | "right";
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={className}>
        {label}
      </button>

      {/*
        Kept mounted and hidden with CSS rather than unmounted on close — `GoogleButton` inside
        `SignInPanel` loads Google's script and renders its button async, so unmounting and
        remounting it on every open re-ran that whole sequence and flashed an empty box each time.
        Mounted once, it's ready before the visitor ever clicks.
      */}
      <div
        // Hard-edged and hairline-bordered like every other surface. It sits over the page, so
        // it keeps a shadow — the one place the site uses depth, to say "this is above".
        className={`absolute z-50 mt-3 w-[20rem] border border-navy-950/15 bg-white p-5 text-left shadow-[0_16px_40px_-12px_rgb(11_18_34/0.25)] ${
          align === "right" ? "right-0" : "left-1/2 -translate-x-1/2"
        } ${open ? "" : "hidden"}`}
      >
        <SignInPanel redirectTo={redirectTo} onSuccess={() => setOpen(false)} />
      </div>
    </div>
  );
}
