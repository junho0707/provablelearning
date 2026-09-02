import { notFound } from "next/navigation";
import { getSessionDetail } from "@/lib/admin/sessions";
import { getMaterialDraft } from "@/lib/sessions/materials";
import { getDiagnosticForTutor } from "@/lib/assessment/diagnostics";
import { labelFor } from "@/lib/accounts/purposes";
import { MaterialsEditor } from "./materials-editor";
import { UploadLink } from "./upload-link";

export const metadata = { title: "Admin — session" };

/**
 * One session, both halves (F12 steps 2 and 3): everything the buyer and student said beforehand,
 * and the form for writing what they get afterwards.
 */
export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, draft, diagnostic] = await Promise.all([
    getSessionDetail(id),
    getMaterialDraft(id),
    getDiagnosticForTutor(id),
  ]);
  if (!session) notFound();

  const prep = session.preparation;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-extrabold text-navy-950">{session.studentName}</h1>
        <p className="mt-1 text-sm text-navy-600">
          {new Date(session.startsAt).toLocaleString()} · {session.status}
          {session.topicMode === "continue" ? " · continuing the last topic" : ""}
        </p>
      </div>

      <section className="rounded-lg border border-navy-100 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-navy-400">
          What they asked for
        </h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="font-semibold text-navy-900">Purpose</dt>
            <dd className="text-navy-800">
              {labelFor(session.purpose) || "—"}
              {session.subPurpose ? ` · ${labelFor(session.subPurpose)}` : ""}
            </dd>
          </div>
          {session.specifics && (
            <div>
              <dt className="font-semibold text-navy-900">From the buyer</dt>
              <dd className="whitespace-pre-line text-navy-800">{session.specifics}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-lg border border-navy-100 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-navy-400">
          From the student
        </h2>

        {/* Missing preparation is stated, not hidden — the tutor needs to know they are going in
            without it (F6 step 4), since the session happens either way. */}
        {!prep ? (
          <p className="text-sm text-navy-600">
            Nothing submitted yet. The session goes ahead regardless.
          </p>
        ) : (
          <dl className="flex flex-col gap-2 text-sm">
            {prep.topic && (
              <div>
                <dt className="font-semibold text-navy-900">Topic</dt>
                <dd className="text-navy-800">{prep.topic}</dd>
              </div>
            )}
            {(prep.currentMathClass || prep.previousMathClass) && (
              <div>
                <dt className="font-semibold text-navy-900">Classes</dt>
                <dd className="text-navy-800">
                  {prep.currentMathClass ?? "—"}
                  {prep.previousMathClass ? ` (previously ${prep.previousMathClass})` : ""}
                </dd>
              </div>
            )}
            {prep.notes && (
              <div>
                <dt className="font-semibold text-navy-900">What&apos;s giving them trouble</dt>
                <dd className="whitespace-pre-line text-navy-800">{prep.notes}</dd>
              </div>
            )}
            {!prep.completedAt && (
              <p className="text-sm text-navy-600">Partly filled in.</p>
            )}
          </dl>
        )}

        {session.uploads.length > 0 && (
          <div className="mt-4 border-t border-navy-100 pt-4">
            <p className="mb-2 text-sm font-semibold text-navy-900">Attachments</p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {session.uploads.map((upload) => (
                <li key={upload.id}>
                  {upload.linkUrl ? (
                    <a
                      href={upload.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-navy-700 underline hover:text-navy-950"
                    >
                      {upload.fileName}
                    </a>
                  ) : (
                    <UploadLink storagePath={upload.storagePath!} fileName={upload.fileName} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Why there is no diagnostic matters as much as the diagnostic: an unauthored set is a gap
          in the content, not a student who skipped their preparation (AT-PRE-7). */}
      {diagnostic.status !== "none_expected" && (
        <section className="rounded-lg border border-navy-100 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-navy-400">
            {diagnostic.status === "taken" ? diagnostic.result.diagnosticName : "Diagnostic"}
          </h2>

          {diagnostic.status === "not_authored" && (
            <p className="text-sm text-navy-600">
              No diagnostic is published for this yet, so they were asked to describe where they are
              instead. Nothing was blocked.
            </p>
          )}
          {diagnostic.status === "not_taken" && (
            <p className="text-sm text-navy-600">Offered, not sat.</p>
          )}

          {diagnostic.status === "taken" && (
            <>
              <p className="text-sm text-navy-700">
                {diagnostic.result.correct} of {diagnostic.result.graded} correct
                {diagnostic.result.items.length > diagnostic.result.graded
                  ? ` · ${diagnostic.result.items.length - diagnostic.result.graded} written answer${
                      diagnostic.result.items.length - diagnostic.result.graded === 1 ? "" : "s"
                    }`
                  : ""}
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {diagnostic.result.items.map((item, index) => (
                  <li key={index} className="border-t border-navy-100 pt-2">
                    <p className="text-navy-900">{item.prompt}</p>
                    <p className="text-navy-600">
                      {item.submitted}
                      {item.isCorrect === null ? "" : item.isCorrect ? " · correct" : " · wrong"}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="rounded-lg border border-navy-100 bg-white p-5">
        <MaterialsEditor bookingId={id} draft={draft} />
      </section>
    </div>
  );
}
