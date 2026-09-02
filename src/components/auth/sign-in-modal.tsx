"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { GoogleButton } from "./google-button";
import { MagicLinkForm } from "./magic-link-form";

export function SignInModal({
  open,
  onClose,
  redirectTo,
}: {
  open: boolean;
  onClose: () => void;
  /** Where to send the user after a successful sign-in. Defaults to staying on the current page. */
  redirectTo?: string;
}) {
  const router = useRouter();

  function handleSuccess() {
    onClose();
    if (redirectTo) router.push(redirectTo);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // A page can put an element in real fullscreen (the roadmap graph does). The browser renders
  // that element in its own top layer, above the entire document regardless of z-index — so a
  // modal opened while fullscreen is active would be portalled into `document.body` and never
  // seen. Dropping fullscreen here is what actually surfaces the modal over that content.
  useEffect(() => {
    if (open && document.fullscreenElement) void document.exitFullscreen();
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-in-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 px-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 id="sign-in-modal-title" className="text-xl font-extrabold tracking-tight text-navy-950">
            Sign in
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-navy-400 hover:text-navy-700"
          >
            ✕
          </button>
        </div>
        <GoogleButton onSuccess={handleSuccess} />

        <div className="my-4 flex items-center gap-3 text-xs font-semibold text-navy-400">
          <div className="h-px flex-1 bg-navy-100" />
          or
          <div className="h-px flex-1 bg-navy-100" />
        </div>

        <MagicLinkForm redirectTo={redirectTo} />
      </div>
    </div>,
    document.body,
  );
}
