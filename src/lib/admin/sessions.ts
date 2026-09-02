"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Everything the tutor needs to prepare for one session, in one read (F12 step 2): what the buyer
 * asked for at booking, what the student added beforehand, and what they attached.
 */

export type SessionDetail = {
  bookingId: string;
  startsAt: string;
  status: string;
  studentName: string;
  purpose: string | null;
  subPurpose: string | null;
  /** What the buyer typed at booking. */
  specifics: string | null;
  topicMode: string | null;
  preparation: {
    topic: string | null;
    currentMathClass: string | null;
    previousMathClass: string | null;
    notes: string | null;
    completedAt: string | null;
  } | null;
  uploads: Array<{
    id: string;
    fileName: string;
    linkUrl: string | null;
    storagePath: string | null;
    uploadedBy: string;
  }>;
};

export async function getSessionDetail(bookingId: string): Promise<SessionDetail | null> {
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, starts_at, status, purpose, sub_purpose, specifics, topic_mode, learner_profiles(name)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;

  const [{ data: preparation }, { data: uploads }] = await Promise.all([
    supabase
      .from("pre_session_submissions")
      .select("topic, current_math_class, previous_math_class, notes, completed_at")
      .eq("booking_id", bookingId)
      .maybeSingle(),
    supabase
      .from("session_uploads")
      .select("id, file_name, link_url, storage_path, uploaded_by")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true }),
  ]);

  const profile = booking.learner_profiles as unknown as { name: string } | { name: string }[] | null;

  return {
    bookingId: booking.id as string,
    startsAt: booking.starts_at as string,
    status: booking.status as string,
    studentName: Array.isArray(profile) ? (profile[0]?.name ?? "—") : (profile?.name ?? "—"),
    purpose: (booking.purpose as string | null) ?? null,
    subPurpose: (booking.sub_purpose as string | null) ?? null,
    specifics: (booking.specifics as string | null) ?? null,
    topicMode: (booking.topic_mode as string | null) ?? null,
    preparation: preparation
      ? {
          topic: (preparation.topic as string | null) ?? null,
          currentMathClass: (preparation.current_math_class as string | null) ?? null,
          previousMathClass: (preparation.previous_math_class as string | null) ?? null,
          notes: (preparation.notes as string | null) ?? null,
          completedAt: (preparation.completed_at as string | null) ?? null,
        }
      : null,
    uploads: (uploads ?? []).map((u) => ({
      id: u.id as string,
      fileName: u.file_name as string,
      linkUrl: (u.link_url as string | null) ?? null,
      storagePath: (u.storage_path as string | null) ?? null,
      uploadedBy: u.uploaded_by as string,
    })),
  };
}

/**
 * A short-lived signed URL for one uploaded file. The bucket is private, so this is the only way
 * to read an upload — a student's homework must not be world-readable to anyone holding the path.
 */
export async function getUploadUrl(storagePath: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .storage.from("session-uploads")
    .createSignedUrl(storagePath, 60 * 10);
  return data?.signedUrl ?? null;
}
