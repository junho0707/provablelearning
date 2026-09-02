"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStudent } from "@/lib/auth/session";
import { UPLOAD_EXTENSIONS, UPLOAD_MAX_BYTES } from "@/lib/policy";
import { assessmentKindFor } from "@/lib/accounts/purposes";
import {
  findDiagnostic,
  getDiagnosticQuestions,
  hasTakenDiagnostic,
  type Diagnostic,
  type DiagnosticQuestion,
} from "@/lib/assessment/diagnostics";
import { preSessionShape, isPreSessionComplete } from "./pre-session-shape";

/**
 * The student's own view of their sessions (F6).
 *
 * Every read here goes through the `student_sessions` view, never `bookings` — students may see
 * when their session is and how to join it, but the booking row itself stays out of reach so they
 * can never book, cancel, or reschedule (INV-ACTOR-1).
 */

export type StudentSession = {
  bookingId: string;
  startsAt: string;
  status: string;
  meetUrl: string | null;
  purpose: string | null;
  subPurpose: string | null;
  specifics: string | null;
  topicMode: string | null;
  preparationComplete: boolean;
  materialsReady: boolean;
};

export async function listStudentSessions(): Promise<StudentSession[]> {
  const student = await requireStudent();
  const supabase = await createClient();

  const [{ data: sessions }, { data: submissions }, { data: materials }] = await Promise.all([
    supabase
      .from("student_sessions")
      .select("id, starts_at, status, meet_url, purpose, sub_purpose, specifics, topic_mode")
      .order("starts_at", { ascending: true }),
    supabase.from("pre_session_submissions").select("booking_id, completed_at"),
    supabase.from("post_session_materials").select("booking_id, published_at"),
  ]);

  const complete = new Set(
    (submissions ?? []).filter((s) => s.completed_at).map((s) => s.booking_id as string),
  );
  const published = new Set(
    (materials ?? []).filter((m) => m.published_at).map((m) => m.booking_id as string),
  );

  void student;
  return (sessions ?? []).map((row) => ({
    bookingId: row.id as string,
    startsAt: row.starts_at as string,
    status: row.status as string,
    meetUrl: (row.meet_url as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? null,
    subPurpose: (row.sub_purpose as string | null) ?? null,
    specifics: (row.specifics as string | null) ?? null,
    topicMode: (row.topic_mode as string | null) ?? null,
    preparationComplete: complete.has(row.id as string),
    materialsReady: published.has(row.id as string),
  }));
}

export type PreSessionView = {
  session: StudentSession;
  shape: ReturnType<typeof preSessionShape>;
  values: {
    topic: string | null;
    currentMathClass: string | null;
    previousMathClass: string | null;
    notes: string | null;
  };
  uploads: Array<{ id: string; fileName: string; linkUrl: string | null; createdAt: string }>;
  /** The diagnostic to serve, if one is authored for this purpose and not already sat. */
  diagnostic: { id: string; name: string; questions: DiagnosticQuestion[] } | null;
};

/**
 * Which diagnostic — if any — this booking should serve, given what the student has told us so
 * far. Shared by the read and the save so the two can never disagree about what was asked.
 *
 * Every outcome except "a published set exists, and this student has not sat it" is a null, and
 * a null is not an error: it degrades to the descriptive questions (AT-PRE-7).
 */
async function resolveDiagnostic(
  session: StudentSession,
  profileId: string,
  currentMathClass: string | null,
): Promise<{ diagnostic: Diagnostic | null; alreadyTaken: boolean }> {
  const kind = session.purpose ? assessmentKindFor(session.purpose) : null;
  if (!kind) return { diagnostic: null, alreadyTaken: false };

  const diagnostic = await findDiagnostic({
    kind,
    subPurpose: session.subPurpose,
    currentMathClass,
  });
  if (!diagnostic) return { diagnostic: null, alreadyTaken: false };

  return { diagnostic, alreadyTaken: await hasTakenDiagnostic(profileId, diagnostic.id) };
}

export async function getPreSession(bookingId: string): Promise<PreSessionView | null> {
  const student = await requireStudent();
  const supabase = await createClient();

  const sessions = await listStudentSessions();
  const session = sessions.find((s) => s.bookingId === bookingId);
  if (!session) return null;

  const [{ data: submission }, { data: uploads }] = await Promise.all([
    supabase
      .from("pre_session_submissions")
      .select("topic, current_math_class, previous_math_class, notes")
      .eq("booking_id", bookingId)
      .maybeSingle(),
    supabase
      .from("session_uploads")
      .select("id, file_name, link_url, created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true }),
  ]);

  const currentMathClass =
    (submission?.current_math_class as string | null) ?? student.currentMathClass;

  const { diagnostic, alreadyTaken } = await resolveDiagnostic(
    session,
    student.profileId,
    currentMathClass,
  );
  const shape = preSessionShape({
    purpose: session.purpose,
    subPurpose: session.subPurpose,
    assessmentAlreadyTaken: alreadyTaken,
    assessmentUnavailable: diagnostic === null,
  });

  return {
    session,
    shape,
    diagnostic:
      shape.assessment && diagnostic
        ? {
            id: diagnostic.id,
            name: diagnostic.name,
            questions: await getDiagnosticQuestions(diagnostic.id, bookingId),
          }
        : null,
    values: {
      topic: (submission?.topic as string | null) ?? null,
      currentMathClass,
      previousMathClass:
        (submission?.previous_math_class as string | null) ?? student.previousMathClass,
      notes: (submission?.notes as string | null) ?? null,
    },
    uploads: (uploads ?? []).map((u) => ({
      id: u.id as string,
      fileName: u.file_name as string,
      linkUrl: (u.link_url as string | null) ?? null,
      createdAt: u.created_at as string,
    })),
  };
}

const saveSchema = z.object({
  bookingId: z.string().uuid(),
  topic: z.string().trim().max(300).optional().nullable(),
  currentMathClass: z.string().trim().max(100).optional().nullable(),
  previousMathClass: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export type SaveResult = { ok: true; complete: boolean } | { ok: false; message: string };

/**
 * Save preparation. Upserted on every keystroke-batch rather than submitted once, so a student who
 * abandons halfway resumes where they left off (AT-PRE-6) instead of starting again.
 */
export async function savePreSession(input: unknown): Promise<SaveResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something in that form wasn't right." };

  const student = await requireStudent();
  const supabase = await createClient();

  const sessions = await listStudentSessions();
  const session = sessions.find((s) => s.bookingId === parsed.data.bookingId);
  if (!session) return { ok: false, message: "That session isn't yours." };

  const { diagnostic, alreadyTaken } = await resolveDiagnostic(
    session,
    student.profileId,
    parsed.data.currentMathClass ?? student.currentMathClass,
  );
  const shape = preSessionShape({
    purpose: session.purpose,
    subPurpose: session.subPurpose,
    assessmentAlreadyTaken: alreadyTaken,
    assessmentUnavailable: diagnostic === null,
  });
  const complete = isPreSessionComplete(shape, parsed.data);

  const { error } = await supabase.from("pre_session_submissions").upsert(
    {
      booking_id: parsed.data.bookingId,
      profile_id: student.profileId,
      topic: parsed.data.topic ?? null,
      current_math_class: parsed.data.currentMathClass ?? null,
      previous_math_class: parsed.data.previousMathClass ?? null,
      notes: parsed.data.notes ?? null,
      completed_at: complete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "booking_id" },
  );

  if (error) return { ok: false, message: "Couldn't save that. Try again." };
  return { ok: true, complete };
}

export type UploadResult = { ok: true } | { ok: false; message: string };

/** Attach a Google Docs (or similar) link instead of a file. */
export async function addSessionLink(input: { bookingId: string; url: string }): Promise<UploadResult> {
  const parsed = z.object({ bookingId: z.string().uuid(), url: z.string().url().max(2000) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "That doesn't look like a link." };

  const student = await requireStudent();
  const supabase = await createClient();

  const { error } = await supabase.from("session_uploads").insert({
    booking_id: parsed.data.bookingId,
    profile_id: student.profileId,
    file_name: new URL(parsed.data.url).hostname,
    link_url: parsed.data.url,
    uploaded_by: "student",
  });

  if (error) return { ok: false, message: "Couldn't add that link." };
  return { ok: true };
}

/**
 * Upload a file. Stored under the student's own profile-id prefix, which is what makes
 * `deleteStudentUploads` exhaustive when consent is withdrawn (AT-COPPA-5).
 */
export async function uploadSessionFile(formData: FormData): Promise<UploadResult> {
  const bookingId = String(formData.get("bookingId") ?? "");
  const file = formData.get("file");

  if (!z.string().uuid().safeParse(bookingId).success) {
    return { ok: false, message: "Something went wrong. Reload and try again." };
  }
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Pick a file first." };
  if (file.size > UPLOAD_MAX_BYTES) {
    return { ok: false, message: `That file is too big — the limit is ${UPLOAD_MAX_BYTES / 1024 / 1024}MB.` };
  }

  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, message: `We accept ${UPLOAD_EXTENSIONS.join(", ")} files, or a link.` };
  }

  const student = await requireStudent();
  const supabase = await createClient();
  const admin = createAdminClient();

  const path = `${student.profileId}/${crypto.randomUUID()}${extension}`;
  const { error: storageError } = await admin.storage
    .from("session-uploads")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (storageError) return { ok: false, message: "Couldn't upload that file. Try again." };

  const { error } = await supabase.from("session_uploads").insert({
    booking_id: bookingId,
    profile_id: student.profileId,
    storage_path: path,
    file_name: file.name,
    content_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: "student",
  });

  if (error) {
    // Never leave an object behind that no row references — it would outlive any deletion request.
    await admin.storage.from("session-uploads").remove([path]);
    return { ok: false, message: "Couldn't attach that file." };
  }
  return { ok: true };
}

export async function removeSessionUpload(uploadId: string): Promise<UploadResult> {
  await requireStudent();
  const supabase = await createClient();

  const { data: upload } = await supabase
    .from("session_uploads")
    .select("id, storage_path")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload) return { ok: false, message: "That file is already gone." };

  const { error } = await supabase.from("session_uploads").delete().eq("id", uploadId);
  if (error) return { ok: false, message: "Couldn't remove that." };

  if (upload.storage_path) {
    await createAdminClient().storage.from("session-uploads").remove([upload.storage_path as string]);
  }
  return { ok: true };
}
