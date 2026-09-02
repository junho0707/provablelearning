import { redirect } from "next/navigation";
import { currentBuyerId } from "@/lib/auth/session";
import { getThread } from "@/lib/messages/thread";
import { Composer } from "./composer";

export const metadata = { title: "Messages" };

/** F11 — the buyer's single thread with the tutor. No response-time promise is made here. */
export default async function MessagesPage() {
  const buyerId = await currentBuyerId();
  if (!buyerId) redirect("/login?next=/messages");

  const messages = await getThread();

  return (
    <main className="mx-auto max-w-[720px] px-5 py-16 sm:px-8">
      <h1 className="text-3xl font-extrabold tracking-[-0.01em] text-navy-950">Messages</h1>
      <p className="mt-2 text-navy-700">
        Anything about your sessions, scheduling, or how your student is getting on.
      </p>

      {messages.length === 0 ? (
        <p className="mt-8 rounded-xl border border-navy-100 bg-white px-5 py-6 text-navy-700">
          No messages yet. Write below and your tutor will pick it up.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                message.sender === "buyer"
                  ? "self-end bg-navy-900 text-white"
                  : "self-start border border-navy-100 bg-white text-navy-900"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.body}</p>
              <p
                className={`mt-1.5 text-xs ${
                  message.sender === "buyer" ? "text-navy-200" : "text-navy-500"
                }`}
              >
                {message.sender === "buyer" ? "You" : "Your tutor"} ·{" "}
                {new Date(message.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Composer />
    </main>
  );
}
