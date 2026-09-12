import Link from "next/link";
import { listThreads } from "@/lib/messages/thread";
import { TUTOR_TIMEZONE } from "@/lib/booking/timezone";
import { stampTime } from "@/lib/time-format";

export const metadata = { title: "Admin — messages" };

/** F12 — the operator's inbox. Threads with unread buyer messages come first. */
export default async function AdminMessagesPage() {
  const threads = await listThreads();

  return (
    <div>
      <h1 className="mb-6 text-xl font-extrabold text-navy-950">Messages</h1>
      {threads.length === 0 ? (
        <p className="text-sm text-navy-500">No threads yet.</p>
      ) : (
        <ul className="space-y-3">
          {threads.map((thread) => (
            <li key={thread.accountId} className="rounded-lg border border-navy-100 p-4 text-sm">
              <Link href={`/admin/messages/${thread.accountId}`} className="block">
                <p className="font-semibold text-navy-900">
                  {thread.buyerEmail}
                  {thread.unread > 0 && (
                    <span className="ml-2 rounded-full bg-navy-900 px-2 py-0.5 text-xs font-semibold text-white">
                      {thread.unread} new
                    </span>
                  )}
                </p>
                <p className="mt-1 truncate text-navy-600">
                  {thread.lastSender === "tutor" ? "You: " : ""}
                  {thread.lastBody}
                </p>
                <p className="mt-0.5 text-xs text-navy-500">
                  {stampTime(thread.lastAt, TUTOR_TIMEZONE)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
