"use client";

import { useState } from "react";
import Link from "next/link";
import { SignInModal } from "@/components/auth/sign-in-modal";

const FIRST_SESSION_PATH = "/first-session";

/**
 * Hero CTA. Signed out it opens the sign-in modal rather than navigating away, then lands the
 * visitor on the first-session flow. Once the first session is bought, the CTA becomes "Book a
 * session" instead.
 */
export function SignUpButton({
  signedIn,
  hasFirstSession,
  className,
}: {
  signedIn: boolean;
  hasFirstSession: boolean;
  className: string;
}) {
  const [open, setOpen] = useState(false);

  if (signedIn) {
    return hasFirstSession ? (
      <Link href="/sessions" className={className}>
        Book a session
      </Link>
    ) : (
      <Link href={FIRST_SESSION_PATH} className={className}>
        Sign up for your first session
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Sign up for your first session
      </button>
      <SignInModal open={open} onClose={() => setOpen(false)} redirectTo={FIRST_SESSION_PATH} />
    </>
  );
}
