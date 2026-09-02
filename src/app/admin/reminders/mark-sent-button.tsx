"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markSmsSent } from "@/lib/admin/reminders";

export function MarkSentButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markSmsSent(bookingId);
          router.refresh();
        })
      }
      className="mt-2 text-xs font-semibold text-navy-700 underline disabled:opacity-40"
    >
      Mark sent
    </button>
  );
}
