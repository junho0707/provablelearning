"use client";

import Link from "next/link";

const FIRST_SESSION_PATH = "/first-session";

/**
 * A plain Google Form for first-session sign-ups. Making a visitor create an account before they
 * could even ask for a first session was too much friction, so a signed-out visitor goes here
 * instead of the sign-in popover. The operator confirms the time and takes payment by email.
 */
const SIGNUP_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSc8hcPC6g_r035v2f6q5WaLWua083tvCDtAeouoHuUtrRMziA/viewform";

/**
 * Hero CTA. Signed out it opens the sign-up form; signed in it goes to the first-session flow.
 * Once the first session is bought, the CTA becomes "Book a session" instead.
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
    <a href={SIGNUP_FORM_URL} target="_blank" rel="noopener noreferrer" className={className}>
      Sign up for your first session
    </a>
  );
}
