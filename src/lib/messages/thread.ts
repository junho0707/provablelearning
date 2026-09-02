"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { currentBuyerId } from "@/lib/auth/session";
import { sendMessageReply } from "@/lib/notify/email";

/**
 * Buyer ↔ tutor messaging (F11). One thread per buyer, keyed by the buyer's account id.
 *
 * **No student path exists here, at any layer.** `requireStudent` is never called, `/student`
 * never links here, and migration 0022 grants students nothing (INV-ACTOR-1).
 */

export type Message = {
  id: string;
  sender: "buyer" | "tutor";
  body: string;
  createdAt: string;
  readAt: string | null;
};

const bodySchema = z.string().trim().min(1).max(4000);

/** The signed-in buyer's thread, oldest first. Reading it marks the tutor's replies read. */
export async function getThread(): Promise<Message[]> {
  const buyerId = await currentBuyerId();
  if (!buyerId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, sender, body, created_at, read_at")
    .order("created_at", { ascending: true });

  const messages = (data ?? []) as Array<{
    id: string;
    sender: "buyer" | "tutor";
    body: string;
    created_at: string;
    read_at: string | null;
  }>;

  const unread = messages.filter((m) => m.sender === "tutor" && !m.read_at).map((m) => m.id);
  if (unread.length > 0) {
    await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unread);
  }

  return messages.map((m) => ({
    id: m.id,
    sender: m.sender,
    body: m.body,
    createdAt: m.created_at,
    readAt: m.read_at,
  }));
}

export type SendResult = { ok: true } | { ok: false; message: string };

export async function sendMessage(body: string): Promise<SendResult> {
  const buyerId = await currentBuyerId();
  if (!buyerId) return { ok: false, message: "Sign in to message your tutor." };

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: "Write something first." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ account_id: buyerId, sender: "buyer", body: parsed.data });

  if (error) return { ok: false, message: "Couldn't send that. Try again." };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Tutor side
// ---------------------------------------------------------------------------------------------

export type ThreadSummary = {
  accountId: string;
  buyerEmail: string;
  lastBody: string;
  lastAt: string;
  lastSender: "buyer" | "tutor";
  unread: number;
};

/**
 * The inbox: one row per buyer who has ever written, threads with unread buyer messages first.
 * The tutor is not emailed about any of this (system/02-POLICIES.md §11) — they work the inbox.
 */
export async function listThreads(): Promise<ThreadSummary[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];

  const { data } = await admin.supabase
    .from("messages")
    .select("account_id, sender, body, created_at, read_at")
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return [];

  const byAccount = new Map<string, ThreadSummary>();
  for (const row of data as Array<{
    account_id: string;
    sender: "buyer" | "tutor";
    body: string;
    created_at: string;
    read_at: string | null;
  }>) {
    const existing = byAccount.get(row.account_id);
    const unread = existing ? existing.unread : 0;
    byAccount.set(row.account_id, {
      accountId: row.account_id,
      buyerEmail: existing?.buyerEmail ?? "—",
      lastBody: row.body,
      lastAt: row.created_at,
      lastSender: row.sender,
      unread: unread + (row.sender === "buyer" && !row.read_at ? 1 : 0),
    });
  }

  const { data: accounts } = await admin.supabase
    .from("accounts")
    .select("id, email")
    .in("id", [...byAccount.keys()]);
  const emailByAccount = new Map((accounts ?? []).map((a) => [a.id as string, a.email as string]));

  return [...byAccount.values()]
    .map((thread) => ({ ...thread, buyerEmail: emailByAccount.get(thread.accountId) ?? "—" }))
    .sort((a, b) => {
      if ((b.unread > 0 ? 1 : 0) !== (a.unread > 0 ? 1 : 0)) return b.unread - a.unread;
      return b.lastAt.localeCompare(a.lastAt);
    });
}

/** One buyer's thread for the operator. Opening it marks their messages read. */
export async function getThreadForAdmin(accountId: string): Promise<Message[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];
  if (!z.string().uuid().safeParse(accountId).success) return [];

  const { data } = await admin.supabase
    .from("messages")
    .select("id, sender, body, created_at, read_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  const messages = (data ?? []) as Array<{
    id: string;
    sender: "buyer" | "tutor";
    body: string;
    created_at: string;
    read_at: string | null;
  }>;

  const unread = messages.filter((m) => m.sender === "buyer" && !m.read_at).map((m) => m.id);
  if (unread.length > 0) {
    await admin.supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread);
  }

  return messages.map((m) => ({
    id: m.id,
    sender: m.sender,
    body: m.body,
    createdAt: m.created_at,
    readAt: m.read_at,
  }));
}

/**
 * Reply as the tutor. The buyer is emailed (system/02-POLICIES.md §11) — best-effort, exactly like
 * every other send: a Resend outage must not lose the reply that is already in the thread.
 */
export async function replyToThread(accountId: string, body: string): Promise<SendResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, message: "Admin only." };

  const parsedId = z.string().uuid().safeParse(accountId);
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedId.success || !parsedBody.success) return { ok: false, message: "Write something first." };

  const { error } = await admin.supabase
    .from("messages")
    .insert({ account_id: parsedId.data, sender: "tutor", body: parsedBody.data });
  if (error) return { ok: false, message: "Couldn't send that reply." };

  const { data: account } = await createAdminClient()
    .from("accounts")
    .select("email")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (account?.email) await sendMessageReply({ to: account.email as string });

  return { ok: true };
}
