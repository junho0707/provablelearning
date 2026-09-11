"use client";

import { useState, useTransition } from "react";
import { setPhone } from "@/lib/accounts/phone";
import { BTN, INPUT } from "@/lib/ui";

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
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhoneValue(e.target.value)}
        placeholder="+1 555 555 5555"
        className={`${INPUT} max-w-[16rem]`}
      />
      <button onClick={save} disabled={pending} className={BTN}>
        Save
      </button>
      {saved && <span className="text-[0.875rem] text-[var(--success)]">Saved.</span>}
      {error && (
        <span role="alert" className="text-[0.875rem] font-medium text-[var(--error)]">
          {error}
        </span>
      )}
    </div>
  );
}
