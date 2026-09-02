"use server";

import { z } from "zod";
import { requireAdmin } from "./guard";
import type { AdminResult } from "./availability";
import { renderPlan } from "@/lib/assessment/plan";
import { roadmapNode } from "@/lib/content/roadmap";

export async function setSessionNotes(bookingId: string, notes: string): Promise<AdminResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsedId = z.string().uuid().safeParse(bookingId);
  if (!parsedId.success) return { ok: false, message: "Invalid booking id." };

  const { error } = await admin.supabase.rpc("set_session_notes", { p_booking_id: parsedId.data, p_notes: notes });
  if (error) return { ok: false, message: "Could not save notes." };
  return { ok: true };
}

/** TASK-FIRST-002. Assembles the written plan's source material for one booking. */
export async function getBookingPlan(bookingId: string): Promise<{ planText: string; sessionNotes: string | null } | null> {
  const admin = await requireAdmin();
  if (!admin.ok) return null;

  const { data: booking } = await admin.supabase
    .from("bookings")
    .select("id, session_notes, purchase_id, learner_profiles(name)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;

  const profile = booking.learner_profiles as unknown as { name: string } | { name: string }[] | null;
  const learnerName = Array.isArray(profile) ? (profile[0]?.name ?? "the learner") : (profile?.name ?? "the learner");

  let mode: "strengths" | "test_prep" | "class_help" | null = null;
  let testSlug: string | null = null;
  let floorNodeIds: string[] = [];

  if (booking.purchase_id) {
    const { data: purchase } = await admin.supabase.from("purchases").select("goal").eq("id", booking.purchase_id).maybeSingle();
    mode = (purchase?.goal as typeof mode) ?? null;

    const { data: assessment } = await admin.supabase
      .from("assessments")
      .select("id, test_slug")
      .eq("purchase_id", booking.purchase_id)
      .maybeSingle();
    if (assessment) {
      testSlug = assessment.test_slug;
      const { data: items } = await admin.supabase
        .from("assessment_items")
        .select("node_id, is_correct, depth")
        .eq("assessment_id", assessment.id)
        .order("depth", { ascending: false });
      const wrong = new Set((items ?? []).filter((i) => !i.is_correct).map((i) => i.node_id));
      floorNodeIds = [...wrong];
    }
  }

  const nodeTitles = Object.fromEntries(floorNodeIds.map((id) => [id, roadmapNode(id)?.title ?? id]));

  const planText = renderPlan({
    learnerName,
    mode,
    testSlug,
    floorNodeIds,
    nodeTitles,
    sessionNotes: booking.session_notes,
  });

  return { planText, sessionNotes: booking.session_notes };
}
