"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  savePreSession,
  addSessionLink,
  uploadSessionFile,
  removeSessionUpload,
  type PreSessionView,
} from "@/lib/sessions/student";
import { UPLOAD_EXTENSIONS } from "@/lib/policy";
import { DiagnosticQuestions } from "./diagnostic";
import { BTN_LG, BTN_SECONDARY, INPUT, LABEL, NOTICE_ERROR, NOTICE_OK } from "@/lib/ui";

/**
 * Pre-session preparation (F6). Which fields appear is decided by `preSessionShape` from the
 * booking's purpose — this component renders whatever it is handed and makes no decisions of its
 * own about what a purpose needs.
 *
 * Nothing here blocks: the student can leave at any point, the session still happens, and what
 * they did fill in reaches the tutor.
 *
 * `onRefresh` re-pulls the view this form was handed. Uploads and diagnostic answers are owned by
 * the server, so after one changes, `router.refresh()` alone updates only the page *behind* the
 * dialog — the list of attachments in here would keep showing the old set.
 */
export function PrepareForm({ view, onRefresh }: { view: PreSessionView; onRefresh?: () => void }) {
  const router = useRouter();
  const { shape, values, uploads } = view;

  const [topic, setTopic] = useState(values.topic ?? "");
  const [currentClass, setCurrentClass] = useState(values.currentMathClass ?? "");
  const [previousClass, setPreviousClass] = useState(values.previousMathClass ?? "");
  const [notes, setNotes] = useState(values.notes ?? "");
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function save() {
    setError(null);
    setStatus(null);
    start(async () => {
      const result = await savePreSession({
        bookingId: view.session.bookingId,
        topic: topic || null,
        currentMathClass: currentClass || null,
        previousMathClass: previousClass || null,
        notes: notes || null,
      });
      if (!result.ok) return setError(result.message);
      setStatus(result.complete ? "Saved — your tutor has everything they need." : "Saved.");
      router.refresh();
      onRefresh?.();
    });
  }

  function attachLink() {
    setError(null);
    start(async () => {
      const result = await addSessionLink({ bookingId: view.session.bookingId, url: link });
      if (!result.ok) return setError(result.message);
      setLink("");
      router.refresh();
      onRefresh?.();
    });
  }

  function attachFile(formData: FormData) {
    setError(null);
    formData.set("bookingId", view.session.bookingId);
    start(async () => {
      const result = await uploadSessionFile(formData);
      if (!result.ok) return setError(result.message);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
      onRefresh?.();
    });
  }

  function remove(id: string) {
    start(async () => {
      await removeSessionUpload(id);
      router.refresh();
      onRefresh?.();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {shape.fields.includes("topic") && (
        <label className="flex flex-col gap-2">
          <span className={LABEL}>{shape.topicLabel}</span>
          <input className={INPUT} value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
      )}

      {shape.fields.includes("classes") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className={LABEL}>What math are you taking now?</span>
            <input
              className={INPUT}
              value={currentClass}
              onChange={(e) => setCurrentClass(e.target.value)}
              placeholder="e.g. Algebra 1"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>And before that?</span>
            <input
              className={INPUT}
              value={previousClass}
              onChange={(e) => setPreviousClass(e.target.value)}
              placeholder="e.g. Pre-Algebra"
            />
          </label>
        </div>
      )}

      {/* After the class fields, because for a math diagnostic those are what select the set
          (AT-PRE-4) — saving them is what makes it appear. */}
      {view.diagnostic && (
        <DiagnosticQuestions bookingId={view.session.bookingId} diagnostic={view.diagnostic} />
      )}

      {shape.fields.includes("notes") && (
        <label className="flex flex-col gap-2">
          <span className={LABEL}>What&apos;s giving you trouble?</span>
          <textarea
            className={`${INPUT} min-h-32`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={4000}
            placeholder="Anything you're stuck on, a question you couldn't finish, or what you'd like to get out of the hour."
          />
        </label>
      )}

      {shape.fields.includes("uploads") && (
        <div className="flex flex-col gap-3">
          <span className={LABEL}>
            Anything to share? <span className="font-normal text-navy-950/45">(optional)</span>
          </span>

          {uploads.length > 0 && (
            <ul className="border-t border-navy-950/10">
              {uploads.map((upload) => (
                <li
                  key={upload.id}
                  className="flex items-center justify-between gap-3 border-b border-navy-950/10 py-2.5 text-[0.875rem]"
                >
                  <span className="truncate text-navy-800">
                    {upload.linkUrl ? `Link — ${upload.fileName}` : upload.fileName}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(upload.id)}
                    className="shrink-0 font-semibold text-navy-950/45 hover:text-[var(--error)]"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form action={attachFile} className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept={UPLOAD_EXTENSIONS.join(",")}
              className="text-[0.875rem] text-navy-700 file:mr-3 file:border-0 file:bg-navy-100 file:px-3 file:py-2 file:text-[0.875rem] file:font-semibold file:text-navy-950"
            />
            <button type="submit" disabled={pending} className={BTN_SECONDARY}>
              Attach
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <input
              className={`${INPUT} max-w-md flex-1`}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="…or paste a Google Docs link"
            />
            <button
              type="button"
              onClick={attachLink}
              disabled={pending || !link}
              className={BTN_SECONDARY}
            >
              Add link
            </button>
          </div>

          <p className="text-[0.875rem] text-navy-950/55">
            We accept {UPLOAD_EXTENSIONS.join(", ")} files.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className={NOTICE_ERROR}>
          {error}
        </p>
      )}
      {status && <p className={NOTICE_OK}>{status}</p>}

      <div>
        <button type="button" onClick={save} disabled={pending} className={BTN_LG}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
