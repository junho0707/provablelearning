"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNoShow } from "@/lib/admin/bookings";

export function NoShowButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markNoShow(bookingId);
          router.refresh();
        })
      }
      className="text-xs font-semibold text-error underline disabled:opacity-40"
    >
      Mark no-show
    </button>
  );
}
