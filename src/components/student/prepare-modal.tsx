"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { getPreSession, type PreSessionView } from "@/lib/sessions/student";
import { PrepareForm } from "./prepare-form";
import { H2, NOTICE } from "@/lib/ui";

/**
 * Pre-session work (F6), opened over the student's home screen rather than on a page of its own.
 *
 * The view is fetched when the dialog opens, not with the page: a student's home lists every
 * upcoming session, and preloading each one's submission, uploads and diagnostic would be several
 * queries per session for a panel most visits never open.
 *
 * The dialog owns no answers. Everything typed here is saved by `PrepareForm` through its own
 * actions, so closing the dialog — by button, backdrop, or Escape — can never lose work that was
 * saved, and never saves work that wasn't.
 */
export function PrepareModal({
  bookingId,
  title,
  trigger,
}: {
  bookingId: string;
  title: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PreSessionView | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(() => {
    start(async () => setView(await getPreSession(bookingId)));
  }, [bookingId]);

  function openDialog() {
    setOpen(true);
    load();
  }

  // Escape closes, and the page behind must not scroll under the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={openDialog} className="block w-full text-left">
        {trigger}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/40 p-4 sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            className="my-auto w-full max-w-[680px] border border-navy-950/10 bg-white p-6 sm:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className={H2}>{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mr-1 -mt-1 px-2 py-1 text-lg text-navy-950/45 hover:text-navy-950"
              >
                ×
              </button>
            </div>

            {view ? (
              <>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-navy-700">
                  {view.shape.blurb}
                </p>
                {/* F6 step 4: never blocking. The student is told the cost of skipping, not stopped. */}
                <p className={`mt-6 ${NOTICE}`}>
                  You don&apos;t have to fill this in — but the session works much better when your
                  tutor knows what to prepare.
                </p>
                <div className="mt-8 border-t border-navy-950/10 pt-8">
                  <PrepareForm view={view} onRefresh={load} />
                </div>
              </>
            ) : (
              <p className="mt-6 text-[0.875rem] text-navy-950/55">
                {pending ? "Loading…" : "That session isn't available."}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
