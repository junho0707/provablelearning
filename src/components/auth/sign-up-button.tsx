"use client";

import Link from "next/link";
import { SignInPopover } from "@/components/auth/sign-in-popover";

const FIRST_SESSION_PATH = "/first-session";

/**
 * Hero CTA. Signed out it opens the sign-in options anchored under itself rather than navigating
 * away, then lands the visitor on the first-session flow. Once the first session is bought, the
 * CTA becomes "Book a session" instead.
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
    <SignInPopover
      label="Sign up for your first session"
      className={className}
      redirectTo={FIRST_SESSION_PATH}
    />
  );
}
