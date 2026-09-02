"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveCreditReturnRequest } from "@/lib/admin/credit-returns";

export function ResolveButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function resolve(decision: "approved" | "denied") {
    startTransition(async () => {
      await resolveCreditReturnRequest(requestId, decision);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 flex gap-3">
      <button disabled={pending} onClick={() => resolve("approved")} className="text-xs font-semibold text-success underline disabled:opacity-40">
        Approve
      </button>
      <button disabled={pending} onClick={() => resolve("denied")} className="text-xs font-semibold text-error underline disabled:opacity-40">
        Deny
      </button>
    </div>
  );
}
