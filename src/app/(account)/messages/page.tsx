import { redirect } from "next/navigation";
import { currentBuyerId } from "@/lib/auth/session";
import { getThread } from "@/lib/messages/thread";
import { Composer } from "./composer";
import { viewerTimeZone } from "@/lib/booking/viewer-timezone";
import { stampTime } from "@/lib/time-format";
import { H1, NOTICE } from "@/lib/ui";

export const metadata = { title: "Messages" };

/** F11 — the buyer's single thread with the tutor. No response-time promise is made here. */
export default async function MessagesPage() {
  const buyerId = await currentBuyerId();
  if (!buyerId) redirect("/login?next=/messages");

  const messages = await getThread();
  const timeZone = await viewerTimeZone();

  return (
    <main className="mx-auto max-w-[720px] px-6 py-16 sm:px-10">
      <h1 className={H1}>Messages</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-navy-700">
        Anything about your sessions, scheduling, or how your student is getting on.
      </p>
      <div className="mt-10 border-t border-navy-950/10" />

      {messages.length === 0 ? (
        <p className={`mt-8 ${NOTICE}`}>
          No messages yet. Write below and your tutor will pick it up.
        </p>
      ) : (
        // Square bubbles: the two sides are told apart by ink and alignment, which is how the rest
        // of the site marks state. A rounded bubble here was the only radius left on the page.
        <ul className="mt-8 flex flex-col gap-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`max-w-[85%] px-4 py-3 text-[0.9375rem] ${
                message.sender === "buyer"
                  ? "self-end bg-navy-950 text-white"
                  : "self-start border border-navy-950/10 bg-white text-navy-900"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
              <p
                className={`mt-2 text-[0.75rem] ${
                  message.sender === "buyer" ? "text-navy-300" : "text-navy-950/45"
                }`}
              >
                {message.sender === "buyer" ? "You" : "Your tutor"} ·{" "}
                {stampTime(message.createdAt, timeZone)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Composer />
    </main>
  );
}
