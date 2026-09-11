"use client";

import { useState } from "react";
import { ContactForm } from "@/components/contact-form";

/**
 * "Questions? Get in touch" — reveals the contact form in the panel it sits in. Deliberately **not**
 * a modal: there is no backdrop and nothing is trapped, so the CTA above it and the footer below
 * stay clickable while the form is open. Asking a question should not take the page away.
 *
 * `/contact` still exists and still works as a direct URL.
 */
export function ContactLink() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <p className="text-[0.875rem] text-white/50">
        Questions?{" "}
        {/* A secondary link on a dark ground: the weight comes off and the underline is set below
            the baseline and dimmed, so it reads as quieter than the gold CTA above it rather than
            competing with it. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white hover:decoration-white"
        >
          Get in touch
        </button>
        .
      </p>

      {open && (
        <div className="mx-auto mt-8 max-w-md text-left">
          <ContactForm />
        </div>
      )}
    </div>
  );
}
