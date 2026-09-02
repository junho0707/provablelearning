"use client";

import { useEffect, useState } from "react";

// Assembled client-side so a plain HTML scrape never sees the address.
export function ObfuscatedEmail() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setEmail(["admin", "provablelearning.com"].join("@"));
  }, []);

  if (!email) {
    return <span className="font-semibold text-navy-800">our team</span>;
  }

  return (
    <a href={`mailto:${email}`} className="font-semibold text-navy-800 hover:underline">
      {email}
    </a>
  );
}
