"use server";

import { requireAdmin } from "./guard";

export type AdminUser = { id: string; email: string; isAdmin: boolean; createdAt: string };

/** TASK-ADMIN-001, contract `listUsers`. Uses `accounts_admin_read` (migration 0010). */
export async function listUsers(): Promise<AdminUser[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];

  const { data } = await admin.supabase.from("accounts").select("id, email, is_admin, created_at").order("created_at", { ascending: false });
  return (data ?? []).map((a) => ({ id: a.id, email: a.email, isAdmin: a.is_admin, createdAt: a.created_at }));
}

export type AdminUserDetail = AdminUser & {
  balance: number;
  profiles: { id: string; name: string }[];
  bookingCount: number;
};

/** TASK-ADMIN-001, contract `viewUser`. */
export async function viewUser(accountId: string): Promise<AdminUserDetail | null> {
  const admin = await requireAdmin();
  if (!admin.ok) return null;

  const [{ data: account }, { data: ledger }, { data: profiles }, { data: bookings }] = await Promise.all([
    admin.supabase.from("accounts").select("id, email, is_admin, created_at").eq("id", accountId).maybeSingle(),
    admin.supabase.from("credit_ledger").select("delta").eq("account_id", accountId),
    admin.supabase.from("learner_profiles").select("id, name").eq("account_id", accountId),
    admin.supabase.from("bookings").select("id").eq("account_id", accountId),
  ]);
  if (!account) return null;

  return {
    id: account.id,
    email: account.email,
    isAdmin: account.is_admin,
    createdAt: account.created_at,
    balance: (ledger ?? []).reduce((sum, row) => sum + row.delta, 0),
    profiles: profiles ?? [],
    bookingCount: (bookings ?? []).length,
  };
}
