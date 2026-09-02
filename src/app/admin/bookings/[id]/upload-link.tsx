"use client";

import { useState, useTransition } from "react";
import { getUploadUrl } from "@/lib/admin/sessions";

/**
 * Opens an uploaded file through a short-lived signed URL, minted on click rather than rendered
 * into the page. The bucket is private, and a signed URL baked into server-rendered HTML would
 * outlive the page it sat on — a link to a child's homework is not something to leave lying in a
 * browser cache.
 */
export function UploadLink({ storagePath, fileName }: { storagePath: string; fileName: string }) {
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  function open() {
    setError(false);
    start(async () => {
      const url = await getUploadUrl(storagePath);
      if (!url) return setError(true);
      window.open(url, "_blank", "noopener");
    });
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className="text-navy-700 underline hover:text-navy-950 disabled:opacity-60"
    >
      {fileName}
      {pending ? " — opening…" : ""}
      {error ? " — couldn't open" : ""}
    </button>
  );
}
