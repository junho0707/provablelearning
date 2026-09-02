import Link from "next/link";
import { getThreadForAdmin } from "@/lib/messages/thread";
import { ReplyBox } from "./reply-box";

export const metadata = { title: "Admin — thread" };

export default async function AdminThreadPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const messages = await getThreadForAdmin(accountId);

  return (
    <div>
      <Link href="/admin/messages" className="text-sm font-semibold text-navy-600 hover:text-navy-900">
        ← Inbox
      </Link>

      <ul className="mt-6 flex flex-col gap-3">
        {messages.map((message) => (
          <li
            key={message.id}
            className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
              message.sender === "tutor"
                ? "self-end bg-navy-900 text-white"
                : "self-start border border-navy-100 bg-white text-navy-900"
            }`}
          >
            <p className="whitespace-pre-wrap">{message.body}</p>
            <p
              className={`mt-1.5 text-xs ${
                message.sender === "tutor" ? "text-navy-200" : "text-navy-500"
              }`}
            >
              {message.sender === "tutor" ? "You" : "Buyer"} ·{" "}
              {new Date(message.createdAt).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>

      <ReplyBox accountId={accountId} />
    </div>
  );
}
