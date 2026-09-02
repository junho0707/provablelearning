"use client";

import { useState, useTransition } from "react";
import { setPhone } from "@/lib/accounts/phone";

export function PhoneSetting({ currentPhone }: { currentPhone: string | null }) {
  const [phone, setPhoneValue] = useState(currentPhone ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setPhone(phone);
      if (!result.ok) return setError(result.message);
      setSaved(true);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhoneValue(e.target.value)}
        placeholder="+1 555 555 5555"
        className="rounded-lg border border-navy-200 px-3 py-2 text-sm"
      />
      <button onClick={save} disabled={pending} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        Save
      </button>
      {saved && <span className="text-sm text-success">Saved.</span>}
      {error && (
        <span role="alert" className="text-sm font-medium text-error">
          {error}
        </span>
      )}
    </div>
  );
}
